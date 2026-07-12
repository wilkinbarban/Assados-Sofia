-- Migração Inicial: Autenticação e Validação de Telefone (Épica 1)
-- ID: 20260703210000_epica1_auth_otp

-- 1. Enums e Extensões
CREATE TYPE public.tipo_funcao AS ENUM ('admin', 'supervisor', 'vendedor', 'cliente');

-- 2. Tabela Perfis (Estende auth.users)
CREATE TABLE public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    funcao public.tipo_funcao NOT NULL DEFAULT 'cliente',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Função e Trigger para atualizar data_atualizacao automaticamente
CREATE OR REPLACE FUNCTION public.atualizar_data_atualizacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_atualizacao = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_perfis_atualizar_data
BEFORE UPDATE ON public.perfis
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 4. Função e Trigger para criar perfil automaticamente ao cadastrar usuário no Supabase Auth
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_ao_criar_usuario
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.ao_criar_usuario();

-- 5. Tabela Clientes (com restrição de telefone de Curitiba)
CREATE TABLE public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(20) UNIQUE NOT NULL,
    endereco TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_telefone_curitiba CHECK (telefone ~ '^55419[0-9]{8}$')
);

CREATE TRIGGER tr_clientes_atualizar_data
BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 6. Tabela Códigos de Verificação (OTP) com restrição de telefone de Curitiba
CREATE TABLE public.codigos_verificacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    telefone VARCHAR(20) NOT NULL,
    codigo VARCHAR(6) NOT NULL,
    expira_em TIMESTAMP WITH TIME ZONE NOT NULL,
    verificado BOOLEAN NOT NULL DEFAULT FALSE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_otp_telefone_curitiba CHECK (telefone ~ '^55419[0-9]{8}$')
);

-- 7. Funções de Apoio para RLS (Security Definer para evitar recursão infinita)
CREATE OR REPLACE FUNCTION public.eh_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfis
        WHERE id = auth.uid() AND funcao = 'admin'::public.tipo_funcao AND ativo = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tem_funcoes(p_funcoes public.tipo_funcao[])
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfis
        WHERE id = auth.uid() AND funcao = ANY(p_funcoes) AND ativo = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Configuração de Row Level Security (RLS)
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codigos_verificacao ENABLE ROW LEVEL SECURITY;

-- Políticas para public.perfis
CREATE POLICY "Leitura de perfis própria ou por funcionários ativos" ON public.perfis
FOR SELECT
USING (
    auth.uid() = id
    OR public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

CREATE POLICY "Alteração de perfis própria ou por admin" ON public.perfis
FOR UPDATE
USING (
    auth.uid() = id
    OR public.eh_admin()
)
WITH CHECK (
    auth.uid() = id
    OR public.eh_admin()
);

CREATE POLICY "Inserção de perfis por admin" ON public.perfis
FOR INSERT
WITH CHECK (
    public.eh_admin()
);

CREATE POLICY "Exclusão de perfis por admin" ON public.perfis
FOR DELETE
USING (
    public.eh_admin()
);

-- Políticas para public.clientes
CREATE POLICY "Leitura de clientes próprio ou por admin" ON public.clientes
FOR SELECT
USING (
    auth.uid() = usuario_id
    OR public.eh_admin()
);

CREATE POLICY "Inserção de clientes próprio ou por admin" ON public.clientes
FOR INSERT
WITH CHECK (
    auth.uid() = usuario_id
    OR public.eh_admin()
);

CREATE POLICY "Alteração de clientes próprio ou por admin" ON public.clientes
FOR UPDATE
USING (
    auth.uid() = usuario_id
    OR public.eh_admin()
)
WITH CHECK (
    auth.uid() = usuario_id
    OR public.eh_admin()
);

CREATE POLICY "Exclusão de clientes por admin" ON public.clientes
FOR DELETE
USING (
    public.eh_admin()
);

-- Políticas para public.codigos_verificacao
CREATE POLICY "Leitura de códigos própria ou por admin" ON public.codigos_verificacao
FOR SELECT
USING (
    auth.uid() = usuario_id
    OR public.eh_admin()
);

CREATE POLICY "Inserção de códigos própria ou por admin" ON public.codigos_verificacao
FOR INSERT
WITH CHECK (
    auth.uid() = usuario_id
    OR public.eh_admin()
);

CREATE POLICY "Alteração de códigos própria ou por admin" ON public.codigos_verificacao
FOR UPDATE
USING (
    auth.uid() = usuario_id
    OR public.eh_admin()
)
WITH CHECK (
    auth.uid() = usuario_id
    OR public.eh_admin()
);

CREATE POLICY "Exclusão de códigos por admin" ON public.codigos_verificacao
FOR DELETE
USING (
    public.eh_admin()
);

-- 9. RPC: Fusão de Contas (mesclar_contas)
CREATE OR REPLACE FUNCTION public.mesclar_contas(
    p_usuario_id UUID,
    p_telefone VARCHAR,
    p_endereco TEXT
) RETURNS VOID AS $$
DECLARE
    v_cliente_existente_id UUID;
    v_cliente_rascunho_id UUID;
    v_perfil_nome VARCHAR(100);
BEGIN
    -- 1. Buscar registro prévio do WhatsApp (usuario_id nulo)
    SELECT id INTO v_cliente_existente_id
    FROM public.clientes WHERE telefone = p_telefone AND usuario_id IS NULL;

    -- 2. Buscar rascunho criado no fluxo web (se houver)
    SELECT id INTO v_cliente_rascunho_id
    FROM public.clientes WHERE usuario_id = p_usuario_id;

    IF v_cliente_existente_id IS NOT NULL THEN
        -- Remove rascunho se duplicado e diferente do existente
        IF v_cliente_rascunho_id IS NOT NULL AND v_cliente_rascunho_id <> v_cliente_existente_id THEN
            DELETE FROM public.clientes WHERE id = v_cliente_rascunho_id;
        END IF;
        -- Associa conta web e atualiza endereço
        UPDATE public.clientes
        SET usuario_id = p_usuario_id,
            endereco = COALESCE(p_endereco, endereco),
            data_atualizacao = NOW()
        WHERE id = v_cliente_existente_id;
    ELSE
        -- Sem WhatsApp prévio: atualiza rascunho ou cria novo
        IF v_cliente_rascunho_id IS NOT NULL THEN
            UPDATE public.clientes
            SET telefone = p_telefone,
                endereco = COALESCE(p_endereco, endereco),
                data_atualizacao = NOW()
            WHERE id = v_cliente_rascunho_id;
        ELSE
            SELECT nome INTO v_perfil_nome FROM public.perfis WHERE id = p_usuario_id;
            INSERT INTO public.clientes (usuario_id, nome, telefone, endereco)
            VALUES (
                p_usuario_id,
                COALESCE(v_perfil_nome, 'Cliente Web'),
                p_telefone,
                p_endereco
            );
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
