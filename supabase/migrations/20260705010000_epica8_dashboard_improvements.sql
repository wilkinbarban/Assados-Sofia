-- Migração para tabela de configurações do sistema (Épica 8)
-- ID: 20260705010000_epica8_dashboard_improvements

-- 1. Criação da Tabela de Configurações do Sistema
CREATE TABLE public.configuracoes_sistema (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    eh_segredo BOOLEAN NOT NULL DEFAULT FALSE,
    data_criacao TIMESTAMPTZ DEFAULT now(),
    data_atualizacao TIMESTAMPTZ DEFAULT now()
);

-- 2. Trigger de atualização automática da data_atualizacao
CREATE TRIGGER tr_configuracoes_sistema_atualizar_data
BEFORE UPDATE ON public.configuracoes_sistema
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 3. Documentação das colunas e tabela (pt-BR)
COMMENT ON TABLE public.configuracoes_sistema IS 'Armazena chaves de configuração e credenciais de integração dinâmicas do sistema.';
COMMENT ON COLUMN public.configuracoes_sistema.chave IS 'Nome identificador único da chave de configuração.';
COMMENT ON COLUMN public.configuracoes_sistema.valor IS 'Valor da respectiva chave de configuração.';
COMMENT ON COLUMN public.configuracoes_sistema.eh_segredo IS 'Sinalizador booleano que indica se o campo é uma credencial sensível que requer mascaramento.';
COMMENT ON COLUMN public.configuracoes_sistema.data_criacao IS 'Data de inserção da chave.';
COMMENT ON COLUMN public.configuracoes_sistema.data_atualizacao IS 'Data da última alteração do valor.';

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- 5. Definição das Políticas RLS
-- Somente administradores e supervisores ativos podem gerenciar e ler as chaves
CREATE POLICY "Leitura de configuracoes por admin e supervisor" ON public.configuracoes_sistema
    FOR SELECT TO authenticated
    USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

CREATE POLICY "Escrita de configuracoes por admin e supervisor" ON public.configuracoes_sistema
    FOR ALL TO authenticated
    USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]))
    WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

-- 6. Concessão de Privilégios às Roles
GRANT ALL ON public.configuracoes_sistema TO postgres, service_role, authenticated, anon;

-- 7. Concessão de Privilégios adicionais para CRM e Vendas (tabelas criadas na Épica 6)
GRANT ALL ON public.produtos TO postgres, service_role, authenticated, anon;
GRANT ALL ON public.pedidos TO postgres, service_role, authenticated, anon;
GRANT ALL ON public.itens_pedido TO postgres, service_role, authenticated, anon;

