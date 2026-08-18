-- Migração: Schema para Autenticação por Telefone do Cliente (Safe Data Foundation)
-- ID: 20260816140000_client_phone_auth_schema

-- 1. Enums para ciclo de vida e propósitos de OTP
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_desafio_otp') THEN
        CREATE TYPE public.tipo_desafio_otp AS ENUM ('signup', 'recovery', 'phone_change');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_desafio_otp') THEN
        CREATE TYPE public.status_desafio_otp AS ENUM ('pending_delivery', 'active', 'consumed', 'expired', 'delivery_failed');
    END IF;
END $$;

-- 2. Alteração na tabela clientes para suportar email opcional e metadados de verificação explícita
ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS telefone_verificado_em TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS telefone_verificado_origem VARCHAR(50) NULL;

-- Índice para busca rápida de clientes verificados por telefone
CREATE INDEX IF NOT EXISTS idx_clientes_telefone_verificado 
ON public.clientes(telefone) 
WHERE telefone_verificado_em IS NOT NULL;

-- 3. Tabela de desafios OTP protegidos por hash HMAC / SHA-256
CREATE TABLE IF NOT EXISTS public.desafios_otp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone VARCHAR(20) NOT NULL,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    proposito public.tipo_desafio_otp NOT NULL DEFAULT 'signup',
    status public.status_desafio_otp NOT NULL DEFAULT 'pending_delivery',
    hash_codigo VARCHAR(128) NOT NULL,
    tentativas INTEGER NOT NULL DEFAULT 0,
    max_tentativas INTEGER NOT NULL DEFAULT 3,
    ip_origem VARCHAR(45) NULL,
    evidencia_entrega JSONB NOT NULL DEFAULT '{}'::jsonb,
    bloqueio_reenvio_ate TIMESTAMP WITH TIME ZONE NULL,
    expira_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
    consumido_em TIMESTAMP WITH TIME ZONE NULL,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_desafio_telefone_curitiba CHECK (telefone ~ '^55419[0-9]{8}$')
);

CREATE INDEX IF NOT EXISTS idx_desafios_otp_busca 
ON public.desafios_otp(telefone, proposito, status);

CREATE INDEX IF NOT EXISTS idx_desafios_otp_cooldown 
ON public.desafios_otp(telefone, bloqueio_reenvio_ate) 
WHERE bloqueio_reenvio_ate IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_desafios_otp_ip_recente 
ON public.desafios_otp(ip_origem, data_criacao) 
WHERE ip_origem IS NOT NULL;

-- Trigger para atualizar data_atualizacao em desafios_otp
DROP TRIGGER IF EXISTS tr_desafios_otp_atualizar_data ON public.desafios_otp;
CREATE TRIGGER tr_desafios_otp_atualizar_data
BEFORE UPDATE ON public.desafios_otp
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 4. Tabela de Concessões de Recuperação de Senha (Recovery Grants)
CREATE TABLE IF NOT EXISTS public.concessoes_recuperacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    desafio_id UUID NOT NULL REFERENCES public.desafios_otp(id) ON DELETE CASCADE,
    telefone VARCHAR(20) NOT NULL,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    expira_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
    aplicado_em TIMESTAMP WITH TIME ZONE NULL,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_concessao_telefone_curitiba CHECK (telefone ~ '^55419[0-9]{8}$')
);

CREATE INDEX IF NOT EXISTS idx_concessoes_recuperacao_token 
ON public.concessoes_recuperacao(token_hash) 
WHERE aplicado_em IS NULL;

-- 5. Row Level Security & Revogação de Acesso Direto para Blindagem
ALTER TABLE public.desafios_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concessoes_recuperacao ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.desafios_otp FROM public, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.concessoes_recuperacao FROM public, anon, authenticated;
