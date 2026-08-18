-- ============================================================
-- Migração: WhatsApp Anti-Bloqueio & Governança de Contatos
-- ID: 20260816220000_whatsapp_safety_contact_status
-- ============================================================

-- 1. Enums de Governança e Classificação
DO $$ BEGIN
    CREATE TYPE public.tipo_status_whatsapp AS ENUM ('ativo', 'opted_out', 'bloqueado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.tipo_contato_cliente AS ENUM ('cliente', 'candidato_emprego', 'fornecedor', 'outro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.tipo_inscricao_cardapio AS ENUM ('inscrito', 'cancelado', 'desconhecido');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Extensão da tabela public.clientes
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS status_whatsapp public.tipo_status_whatsapp NOT NULL DEFAULT 'ativo',
    ADD COLUMN IF NOT EXISTS tipo_contato public.tipo_contato_cliente NOT NULL DEFAULT 'cliente',
    ADD COLUMN IF NOT EXISTS inscricao_cardapio public.tipo_inscricao_cardapio NOT NULL DEFAULT 'desconhecido',
    ADD COLUMN IF NOT EXISTS cardapio_opt_in_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cardapio_opt_out_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultima_interacao_recebida_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultima_interacao_enviada_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultimo_cardapio_enviado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultimo_marketing_enviado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS automacao_permitida BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS motivo_bloqueio TEXT;

-- 3. Índices para performance e consultas do Safety Gate
CREATE INDEX IF NOT EXISTS idx_clientes_status_whatsapp ON public.clientes (status_whatsapp);
CREATE INDEX IF NOT EXISTS idx_clientes_inscricao_cardapio ON public.clientes (inscricao_cardapio);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo_contato ON public.clientes (tipo_contato);

-- 4. Função Atômica RPC: Registrar Opt-Out do Cliente
CREATE OR REPLACE FUNCTION public.registrar_opt_out_cliente(
    p_cliente_id UUID,
    p_motivo TEXT DEFAULT NULL,
    p_apenas_cardapio BOOLEAN DEFAULT FALSE
)
RETURNS public.clientes AS $$
DECLARE
    v_cliente public.clientes;
BEGIN
    IF p_apenas_cardapio THEN
        UPDATE public.clientes
        SET
            inscricao_cardapio = 'cancelado',
            cardapio_opt_out_em = now(),
            data_atualizacao = now()
        WHERE id = p_cliente_id
        RETURNING * INTO v_cliente;
    ELSE
        UPDATE public.clientes
        SET
            status_whatsapp = 'opted_out',
            inscricao_cardapio = 'cancelado',
            cardapio_opt_out_em = COALESCE(cardapio_opt_out_em, now()),
            automacao_permitida = false,
            motivo_bloqueio = COALESCE(p_motivo, 'Solicitação explícita de opt-out'),
            data_atualizacao = now()
        WHERE id = p_cliente_id
        RETURNING * INTO v_cliente;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_cliente;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função Atômica RPC: Registrar Opt-In de Cardápio
CREATE OR REPLACE FUNCTION public.registrar_opt_in_cardapio(
    p_cliente_id UUID
)
RETURNS public.clientes AS $$
DECLARE
    v_cliente public.clientes;
BEGIN
    UPDATE public.clientes
    SET
        inscricao_cardapio = 'inscrito',
        cardapio_opt_in_em = now(),
        status_whatsapp = CASE WHEN status_whatsapp = 'opted_out' THEN 'ativo'::public.tipo_status_whatsapp ELSE status_whatsapp END,
        automacao_permitida = true,
        data_atualizacao = now()
    WHERE id = p_cliente_id
    RETURNING * INTO v_cliente;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_cliente;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função Atômica RPC: Atualizar Interações
CREATE OR REPLACE FUNCTION public.atualizar_interacao_cliente(
    p_cliente_id UUID,
    p_direcao VARCHAR -- 'inbound' | 'outbound' | 'cardapio' | 'marketing'
)
RETURNS VOID AS $$
BEGIN
    IF p_direcao = 'inbound' THEN
        UPDATE public.clientes
        SET ultima_interacao_recebida_em = now(), data_atualizacao = now()
        WHERE id = p_cliente_id;
    ELSIF p_direcao = 'outbound' THEN
        UPDATE public.clientes
        SET ultima_interacao_enviada_em = now(), data_atualizacao = now()
        WHERE id = p_cliente_id;
    ELSIF p_direcao = 'cardapio' THEN
        UPDATE public.clientes
        SET ultimo_cardapio_enviado_em = now(), ultima_interacao_enviada_em = now(), data_atualizacao = now()
        WHERE id = p_cliente_id;
    ELSIF p_direcao = 'marketing' THEN
        UPDATE public.clientes
        SET ultimo_marketing_enviado_em = now(), ultima_interacao_enviada_em = now(), data_atualizacao = now()
        WHERE id = p_cliente_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION public.registrar_opt_out_cliente TO postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_opt_in_cardapio TO postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_interacao_cliente TO postgres, service_role, authenticated;
