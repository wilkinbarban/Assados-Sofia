-- ============================================================
-- Migração: WhatsApp Safety Gate & Deduplicação de Mensagens
-- ID: 20260816230000_whatsapp_safety_dedup
-- ============================================================

-- 1. Tabela de Deduplicação de Envios
CREATE TABLE IF NOT EXISTS public.whatsapp_envios_dedup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave_dedup VARCHAR(255) UNIQUE NOT NULL,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    tipo_mensagem VARCHAR(50) NOT NULL,
    conteudo_hash VARCHAR(64),
    data_criacao TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em TIMESTAMPTZ NOT NULL
);

-- 2. Índices de performance e TTL
CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_dedup_chave ON public.whatsapp_envios_dedup (chave_dedup);
CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_dedup_expira ON public.whatsapp_envios_dedup (expira_em);
CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_dedup_cliente ON public.whatsapp_envios_dedup (cliente_id, tipo_mensagem);

-- 3. Habilitar RLS
ALTER TABLE public.whatsapp_envios_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso a deduplicação restrito ao sistema" ON public.whatsapp_envios_dedup;
CREATE POLICY "Acesso a deduplicação restrito ao sistema" ON public.whatsapp_envios_dedup
FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

-- 4. Função Atômica RPC: Verificar e Registrar Deduplicação
CREATE OR REPLACE FUNCTION public.verificar_e_registrar_dedup(
    p_chave_dedup VARCHAR,
    p_cliente_id UUID,
    p_tipo_mensagem VARCHAR,
    p_conteudo_hash VARCHAR DEFAULT NULL,
    p_ttl_segundos INTEGER DEFAULT 86400 -- 24 horas padrão
)
RETURNS BOOLEAN AS $$
DECLARE
    v_expira_em TIMESTAMPTZ;
BEGIN
    -- Limpar registros expirados com essa chave se houver
    DELETE FROM public.whatsapp_envios_dedup
    WHERE chave_dedup = p_chave_dedup AND expira_em < now();

    v_expira_em := now() + (p_ttl_segundos || ' seconds')::INTERVAL;

    -- Tentar inserir atomicamente
    BEGIN
        INSERT INTO public.whatsapp_envios_dedup (
            chave_dedup,
            cliente_id,
            tipo_mensagem,
            conteudo_hash,
            data_criacao,
            expira_em
        ) VALUES (
            p_chave_dedup,
            p_cliente_id,
            p_tipo_mensagem,
            p_conteudo_hash,
            now(),
            v_expira_em
        );

        -- Inserção teve sucesso: chave era nova
        RETURN TRUE;
    EXCEPTION
        WHEN unique_violation THEN
            -- Chave já existe e ainda está válida (duplicata detectada)
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT ALL ON public.whatsapp_envios_dedup TO postgres, service_role;
GRANT SELECT, INSERT, DELETE ON public.whatsapp_envios_dedup TO authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_e_registrar_dedup TO postgres, service_role, authenticated;
