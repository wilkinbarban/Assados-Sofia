-- ============================================================
-- Migração: Human Handoff & Cooldown Protection para Sofía
-- ID: 20260816240000_whatsapp_safety_human_handoff
-- ============================================================

-- 1. Adicionar silenciada_ate e expandir check constraint em whatsapp_sofia_states
ALTER TABLE public.whatsapp_sofia_states
    ADD COLUMN IF NOT EXISTS silenciada_ate TIMESTAMPTZ;

-- Atualizar constraint de motivo para suportar novos motivos operacionais
ALTER TABLE public.whatsapp_sofia_states
    DROP CONSTRAINT IF EXISTS whatsapp_sofia_states_motivo_check;

ALTER TABLE public.whatsapp_sofia_states
    ADD CONSTRAINT whatsapp_sofia_states_motivo_check
    CHECK (motivo IS NULL OR (motivo = ANY (ARRAY['manual'::text, 'handoff_phrase'::text, 'cooldown_operador'::text, 'opt_out'::text])));

-- 2. Índice para consultas de cooldown
CREATE INDEX IF NOT EXISTS idx_whatsapp_sofia_states_silenciada_ate
    ON public.whatsapp_sofia_states (silenciada_ate)
    WHERE silenciada_ate IS NOT NULL;

-- 3. Função Atômica RPC: Silenciar Sofía para um Cliente (com Cooldown)
CREATE OR REPLACE FUNCTION public.silenciar_sofia_cliente(
    p_cliente_id UUID,
    p_minutos INTEGER DEFAULT 60,
    p_motivo VARCHAR DEFAULT 'cooldown_operador',
    p_usuario_id UUID DEFAULT NULL
)
RETURNS public.whatsapp_sofia_states AS $$
DECLARE
    v_state public.whatsapp_sofia_states;
    v_silenciada_ate TIMESTAMPTZ;
BEGIN
    IF p_minutos > 0 THEN
        v_silenciada_ate := now() + (p_minutos || ' minutes')::INTERVAL;
    ELSE
        v_silenciada_ate := NULL; -- Silêncio permanente até reativação manual
    END IF;

    INSERT INTO public.whatsapp_sofia_states (
        cliente_id,
        canal,
        sofia_dormindo,
        motivo,
        origem,
        alterado_por,
        silenciada_ate,
        data_atualizacao
    ) VALUES (
        p_cliente_id,
        'whatsapp',
        true,
        p_motivo,
        CASE WHEN p_usuario_id IS NOT NULL THEN 'operator' ELSE 'evolution_webhook' END,
        p_usuario_id,
        v_silenciada_ate,
        now()
    )
    ON CONFLICT (cliente_id, canal) DO UPDATE
    SET
        sofia_dormindo = true,
        motivo = EXCLUDED.motivo,
        origem = EXCLUDED.origem,
        alterado_por = COALESCE(EXCLUDED.alterado_por, whatsapp_sofia_states.alterado_por),
        silenciada_ate = EXCLUDED.silenciada_ate,
        data_atualizacao = now()
    RETURNING * INTO v_state;

    -- Também atualizar as conversas ativas desse cliente para ia_ativa = false
    UPDATE public.conversas
    SET ia_ativa = false, data_atualizacao = now()
    WHERE cliente_id = p_cliente_id AND status = 'aberta';

    RETURN v_state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função Atômica RPC: Reativar Sofía para um Cliente
CREATE OR REPLACE FUNCTION public.reativar_sofia_cliente(
    p_cliente_id UUID,
    p_usuario_id UUID DEFAULT NULL
)
RETURNS public.whatsapp_sofia_states AS $$
DECLARE
    v_state public.whatsapp_sofia_states;
BEGIN
    INSERT INTO public.whatsapp_sofia_states (
        cliente_id,
        canal,
        sofia_dormindo,
        motivo,
        origem,
        alterado_por,
        silenciada_ate,
        data_atualizacao
    ) VALUES (
        p_cliente_id,
        'whatsapp',
        false,
        'manual',
        'operator',
        p_usuario_id,
        NULL,
        now()
    )
    ON CONFLICT (cliente_id, canal) DO UPDATE
    SET
        sofia_dormindo = false,
        motivo = 'manual',
        origem = 'operator',
        alterado_por = COALESCE(p_usuario_id, whatsapp_sofia_states.alterado_por),
        silenciada_ate = NULL,
        data_atualizacao = now()
    RETURNING * INTO v_state;

    -- Reativar IA nas conversas abertas
    UPDATE public.conversas
    SET ia_ativa = true, data_atualizacao = now()
    WHERE cliente_id = p_cliente_id AND status = 'aberta';

    RETURN v_state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função RPC: Verificar se Sofía está silenciada para um cliente
CREATE OR REPLACE FUNCTION public.verificar_sofia_silenciada(
    p_cliente_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_state public.whatsapp_sofia_states;
BEGIN
    SELECT * INTO v_state
    FROM public.whatsapp_sofia_states
    WHERE cliente_id = p_cliente_id AND canal = 'whatsapp';

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Se não está dormindo, retorna falso
    IF NOT v_state.sofia_dormindo THEN
        RETURN FALSE;
    END IF;

    -- Se está dormindo com tempo de silêncio configurado
    IF v_state.silenciada_ate IS NOT NULL THEN
        IF v_state.silenciada_ate <= now() THEN
            -- Cooldown expirou: reativar automaticamente
            UPDATE public.whatsapp_sofia_states
            SET sofia_dormindo = false, silenciada_ate = NULL, data_atualizacao = now()
            WHERE id = v_state.id;

            UPDATE public.conversas
            SET ia_ativa = true, data_atualizacao = now()
            WHERE cliente_id = p_cliente_id AND status = 'aberta';

            RETURN FALSE;
        ELSE
            -- Ainda dentro do período de cooldown
            RETURN TRUE;
        END IF;
    END IF;

    -- Está dormindo permanentemente (até reativação manual)
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION public.silenciar_sofia_cliente TO postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.reativar_sofia_cliente TO postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_sofia_silenciada TO postgres, service_role, authenticated;
