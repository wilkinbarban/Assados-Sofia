-- Migration: Judgment Day Client Role Security Fixes v2
-- Fix Telegram logic regression, secure mesclar_contas and chk_clientes_crm_metadata

-- 1. Fortalecer a segurança da função mesclar_contas (HD-03 / HS-03) preservando a lógica do Telegram
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
    -- Segurança: Impedir chamadas de usuários autenticados/anônimos com ID que não seja o seu próprio (evita bypass de anônimos)
    IF auth.role() IN ('authenticated', 'anon') THEN
        IF auth.uid() IS NULL OR auth.uid() <> p_usuario_id THEN
            RAISE EXCEPTION 'Acesso negado: ID de usuário inválido.';
        END IF;
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

-- 2. Trigger para impedir que clientes definam ou alterem metadatos de CRM (HD-02 / HS-01)
CREATE OR REPLACE FUNCTION public.chk_clientes_crm_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for executado por service_role ou sem sessão de usuário ativo, permitir
    IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Se for um funcionário ou admin autorizado, permitir
    IF public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]) THEN
        RETURN NEW;
    END IF;

    -- Caso contrário (cliente), impede a inserção ou alteração de tags, notas ou score
    IF TG_OP = 'INSERT' THEN
        IF (NEW.tags IS NOT NULL) OR (NEW.notas IS NOT NULL) OR (NEW.score IS NOT NULL) THEN
            RAISE EXCEPTION 'Acesso negado: Clientes não possuem permissão para definir metadatos de CRM.';
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.tags IS DISTINCT FROM NEW.tags) OR 
           (OLD.notas IS DISTINCT FROM NEW.notas) OR 
           (OLD.score IS DISTINCT FROM NEW.score) THEN
            RAISE EXCEPTION 'Acesso negado: Clientes não possuem permissão para alterar metadatos de CRM.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS trg_chk_clientes_crm_metadata ON public.clientes;
CREATE TRIGGER trg_chk_clientes_crm_metadata
    BEFORE INSERT OR UPDATE ON public.clientes
    FOR EACH ROW
    EXECUTE FUNCTION public.chk_clientes_crm_metadata();
