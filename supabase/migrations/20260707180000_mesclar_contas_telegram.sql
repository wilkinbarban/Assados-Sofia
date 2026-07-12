-- Migração: mesclar_contas v2 — Suporte a clientes Telegram órfãos
-- ID: 20260707180000_mesclar_contas_telegram

-- Recria a função mesclar_contas com lógica expandida para vincular
-- clientes Telegram que já forneceram o telefone via compartilhamento de contato.
--
-- Cenários cobertos:
-- 1. Cliente WhatsApp existente (telefone preenchido, usuario_id nulo)
--    → Associa usuario_id e endereço ao registro existente
-- 2. Cliente Telegram existente (telegram_chat_id preenchido, usuario_id nulo)
--    → Se o telefone bater, associa usuario_id e endereço
-- 3. Cliente novo (sem registros prévios)
--    → Cria novo registro em clientes
-- 4. Rascunho web já existente (usuario_id preenchido, sem telefone)
--    → Atualiza com telefone e endereço

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
        -- (os dados de telegram_chat_id já podem ser migrados se necessário)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mesclar_contas(UUID, VARCHAR, TEXT) IS
'Funde contas de clientes durante verificação OTP. Suporta WhatsApp, Telegram (via contato compartilhado) e rascunhos web.';
