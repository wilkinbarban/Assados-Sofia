-- Migração para logs de auditoria e segurança administrativa (Épica 8)
-- ID: 20260705000000_epica8_dashboard_admin

-- 1. Criação da tabela de logs de auditoria
CREATE TABLE public.logs_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    acao VARCHAR(255) NOT NULL,
    detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Comentários de documentação (pt-BR)
COMMENT ON TABLE public.logs_auditoria IS 'Tabela que armazena os logs de auditoria das ações administrativas e de segurança executadas pelos operadores.';
COMMENT ON COLUMN public.logs_auditoria.id IS 'Identificador único do registro de log de auditoria.';
COMMENT ON COLUMN public.logs_auditoria.usuario_id IS 'Identificador do usuário que realizou a ação auditada (nulo se sistema ou não autenticado).';
COMMENT ON COLUMN public.logs_auditoria.acao IS 'Identificador textual da ação executada (ex: atualizar_perfil, teste_calendario).';
COMMENT ON COLUMN public.logs_auditoria.detalhes IS 'Detalhes adicionais estruturados em JSONB referentes à ação executada.';
COMMENT ON COLUMN public.logs_auditoria.data_criacao IS 'Data e hora do registro da ação.';

-- 3. Habilitação do Row Level Security (RLS)
ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;

-- 4. Criação de Políticas RLS restritivas (somente leitura e escrita por admin e supervisor; sem UPDATE/DELETE)
CREATE POLICY "Leitura de logs por admin e supervisor" ON public.logs_auditoria
    FOR SELECT TO authenticated
    USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

CREATE POLICY "Inserção de logs por admin e supervisor" ON public.logs_auditoria
    FOR INSERT TO authenticated
    WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

-- 5. Concessão de privilégios para as roles do Supabase
GRANT ALL ON public.logs_auditoria TO postgres, service_role, authenticated, anon;
GRANT ALL ON public.perfis TO postgres, service_role, authenticated, anon;
GRANT ALL ON public.clientes TO postgres, service_role, authenticated, anon;
GRANT ALL ON public.conversas TO postgres, service_role, authenticated, anon;
GRANT ALL ON public.mensagens TO postgres, service_role, authenticated, anon;
