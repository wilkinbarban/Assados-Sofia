-- Migration: Judgment Day Auth, Horarios and Logs Fixes
-- Address security findings: HD-01, HD-02, HD-03, HD-04, HS-01, HS-02, HS-04

-- 1. Alterar tabela codigos_verificacao para rastrear tentativas de validação (HD-01)
ALTER TABLE public.codigos_verificacao 
ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0;

-- 2. Restringir políticas RLS de codigos_verificacao para impedir injeção direta de códigos (HS-01)
DROP POLICY IF EXISTS "Inserção de códigos própria ou por admin" ON public.codigos_verificacao;
DROP POLICY IF EXISTS "Alteração de códigos própria ou por admin" ON public.codigos_verificacao;

-- Revogar permissões diretas de escrita para impedir injeções via API REST / PostgREST
REVOKE INSERT, UPDATE, DELETE ON TABLE public.codigos_verificacao FROM public, anon, authenticated;

-- 3. Função atômica para incrementar tentativas de verificação de OTP (Evita condições de corrida / Race Conditions)
CREATE OR REPLACE FUNCTION public.incrementar_tentativas_otp(p_otp_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.codigos_verificacao
    SET tentativas = tentativas + 1
    WHERE id = p_otp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 4. Função auxiliar para migrar/re-vincular dependências de clientes antes da exclusão (Evita FK RESTRICT / Cascades indesejados)
CREATE OR REPLACE FUNCTION public.mesclar_dependencias_cliente(
    p_cliente_origem_id UUID,
    p_cliente_destino_id UUID
) RETURNS VOID AS $$
BEGIN
    -- 1. Re-vincular pedidos
    UPDATE public.pedidos 
    SET cliente_id = p_cliente_destino_id 
    WHERE cliente_id = p_cliente_origem_id;

    -- 2. Re-vincular conversas
    UPDATE public.conversas 
    SET cliente_id = p_cliente_destino_id 
    WHERE cliente_id = p_cliente_origem_id;

    -- 3. Re-vincular comprovantes
    UPDATE public.comprovantes 
    SET cliente_id = p_cliente_destino_id 
    WHERE cliente_id = p_cliente_origem_id;

    -- 4. Limpar estados de WhatsApp/Sofia do cliente de origem
    DELETE FROM public.whatsapp_sofia_states 
    WHERE cliente_id = p_cliente_origem_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 5. Fortalecer RPC mesclar_contas para exigir validação de OTP prévia antes de fusão (HS-02)
CREATE OR REPLACE FUNCTION public.mesclar_contas(
    p_usuario_id UUID,
    p_telefone VARCHAR,
    p_endereco TEXT
) RETURNS VOID AS $$
DECLARE
    v_cliente_existente_id UUID;
    v_cliente_rascunho_id UUID;
    v_cliente_telegram_id UUID;
    v_perfil_nome VARCHAR(100);
BEGIN
    -- Seguridad: Impedir chamadas de usuários autenticados/anônimos com ID que não seja o seu próprio (evita bypass de anônimos)
    IF auth.role() IN ('authenticated', 'anon') THEN
        IF auth.uid() IS NULL OR auth.uid() <> p_usuario_id THEN
            RAISE EXCEPTION 'Acesso negado: ID de usuário inválido.';
        END IF;
    END IF;

    -- Seguridad (HS-02): Garantir que exista uma verificação OTP bem-sucedida nos últimos 15 minutos para este usuário e telefone
    IF NOT EXISTS (
        SELECT 1 FROM public.codigos_verificacao
        WHERE usuario_id = p_usuario_id 
          AND telefone = p_telefone 
          AND verificado = TRUE 
          AND data_criacao >= NOW() - INTERVAL '15 minutes'
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Nenhuma verificação OTP recente encontrada para este telefone.';
    END IF;

    -- 1. Buscar registro prévio do WhatsApp (telefone preenchido, usuario_id nulo)
    SELECT id INTO v_cliente_existente_id
    FROM public.clientes
    WHERE telefone = p_telefone AND usuario_id IS NULL
    LIMIT 1;

    -- 2. Buscar rascunho criado no fluxo web (se houver)
    SELECT id INTO v_cliente_rascunho_id
    FROM public.clientes
    WHERE usuario_id = p_usuario_id
    LIMIT 1;

    -- 3. Buscar cliente Telegram órfão com mesmo telefone (compartilhou contato)
    --    que ainda não foi vinculado a nenhum usuario_id
    SELECT id INTO v_cliente_telegram_id
    FROM public.clientes
    WHERE telefone = p_telefone
      AND telegram_chat_id IS NOT NULL
      AND usuario_id IS NULL
      AND id IS DISTINCT FROM v_cliente_existente_id
    LIMIT 1;

    -- ── CASO A: Cliente WhatsApp prévio encontrado ──────────
    IF v_cliente_existente_id IS NOT NULL THEN
        -- Remove rascunho web se duplicado e diferente do existente
        IF v_cliente_rascunho_id IS NOT NULL AND v_cliente_rascunho_id <> v_cliente_existente_id THEN
            PERFORM public.mesclar_dependencias_cliente(v_cliente_rascunho_id, v_cliente_existente_id);
            DELETE FROM public.clientes WHERE id = v_cliente_rascunho_id;
        END IF;

        -- Se houver cliente Telegram vinculado ao mesmo telefone, remove-o
        IF v_cliente_telegram_id IS NOT NULL AND v_cliente_telegram_id <> v_cliente_existente_id THEN
            -- Migra telegram_chat_id do cliente Telegram para o WhatsApp
            UPDATE public.clientes
            SET telegram_chat_id = (
                SELECT telegram_chat_id FROM public.clientes WHERE id = v_cliente_telegram_id
            )
            WHERE id = v_cliente_existente_id
              AND telegram_chat_id IS NULL;

            PERFORM public.mesclar_dependencias_cliente(v_cliente_telegram_id, v_cliente_existente_id);
            DELETE FROM public.clientes WHERE id = v_cliente_telegram_id;
        END IF;

        -- Associa conta web e atualiza endereço
        UPDATE public.clientes
        SET usuario_id = p_usuario_id,
            endereco = COALESCE(p_endereco, endereco),
            data_atualizacao = NOW()
        WHERE id = v_cliente_existente_id;

        RETURN;
    END IF;

    -- ── CASO B: Cliente Telegram órfão encontrado ───────────
    IF v_cliente_telegram_id IS NOT NULL THEN
        -- Remove rascunho web se existir e for diferente
        IF v_cliente_rascunho_id IS NOT NULL AND v_cliente_rascunho_id <> v_cliente_telegram_id THEN
            PERFORM public.mesclar_dependencias_cliente(v_cliente_rascunho_id, v_cliente_telegram_id);
            DELETE FROM public.clientes WHERE id = v_cliente_rascunho_id;
        END IF;

        -- Associa usuario_id ao cliente Telegram existente
        UPDATE public.clientes
        SET usuario_id = p_usuario_id,
            endereco = COALESCE(p_endereco, endereco),
            data_atualizacao = NOW()
        WHERE id = v_cliente_telegram_id;

        RETURN;
    END IF;

    -- ── CASO C: Sem cliente prévio ──────────────────────────
    IF v_cliente_rascunho_id IS NOT NULL THEN
        -- Atualiza rascunho web existente com telefone
        UPDATE public.clientes
        SET telefone = p_telefone,
            endereco = COALESCE(p_endereco, endereco),
            data_atualizacao = NOW()
        WHERE id = v_cliente_rascunho_id;
    ELSE
        -- Cria novo cliente
        SELECT nome INTO v_perfil_nome FROM public.perfis WHERE id = p_usuario_id;
        INSERT INTO public.clientes (usuario_id, nome, telefone, endereco)
        VALUES (
            p_usuario_id,
            COALESCE(v_perfil_nome, 'Cliente Web'),
            p_telefone,
            p_endereco
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 6. Hardening de funções SECURITY DEFINER de banco com search_path seguro (HS-04)
CREATE OR REPLACE FUNCTION public.ao_criar_usuario()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfis (id, nome, funcao, ativo)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', 'Novo Cliente'),
        'cliente',
        TRUE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.eh_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfis
        WHERE id = auth.uid() AND funcao = 'admin'::public.tipo_funcao AND ativo = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.tem_funcoes(p_funcoes public.tipo_funcao[])
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfis
        WHERE id = auth.uid() AND funcao = ANY(p_funcoes) AND ativo = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.buscar_produtos_disponiveis()
RETURNS TABLE(id UUID, nome VARCHAR, descricao TEXT, preco_centavos INTEGER, url_imagem TEXT, url_imagem_thumb TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb
    FROM public.produtos p
    WHERE p.ativo = TRUE AND (p.controlar_estoque = FALSE OR p.quantidade_estoque > 0)
    ORDER BY p.nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.buscar_produto_por_nome(p_nome TEXT)
RETURNS TABLE(id UUID, nome VARCHAR, descricao TEXT, preco_centavos INTEGER, url_imagem TEXT, url_imagem_thumb TEXT, quantidade_estoque INTEGER, ativo BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb, p.quantidade_estoque, p.ativo
    FROM public.produtos p
    WHERE p.nome ILIKE '%' || p_nome || '%'
    ORDER BY p.nome
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;
