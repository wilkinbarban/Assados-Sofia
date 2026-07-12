-- Migração para Melhorias Gerais (Épica 10)
-- ID: 20260707000000_epica10_melhorias_gerais

-- 1. Alterar public.clientes: remover NOT NULL de telefone e adicionar telegram_chat_id
ALTER TABLE public.clientes ALTER COLUMN telefone DROP NOT NULL;
ALTER TABLE public.clientes ADD COLUMN telegram_chat_id VARCHAR(100) UNIQUE;

-- 2. Alterar public.mensagens: adicionar telegram_mensagem_id para idempotência
ALTER TABLE public.mensagens ADD COLUMN telegram_mensagem_id VARCHAR(100) UNIQUE;

-- 3. Criar tabela de metadados para documentos de conhecimento
CREATE TABLE public.documentos_conhecimento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_arquivo TEXT NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    tipo_mime TEXT NOT NULL,
    caminho_storage TEXT NOT NULL,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Criar trigger de atualização de data_atualizacao para documentos_conhecimento
CREATE TRIGGER tr_documentos_conhecimento_atualizar_data
BEFORE UPDATE ON public.documentos_conhecimento
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 5. Alterar public.base_conhecimento: adicionar referência para documento_id com delete cascade
ALTER TABLE public.base_conhecimento 
ADD COLUMN documento_id UUID REFERENCES public.documentos_conhecimento(id) ON DELETE CASCADE;

-- 6. Habilitar RLS na tabela documentos_conhecimento
ALTER TABLE public.documentos_conhecimento ENABLE ROW LEVEL SECURITY;

-- 7. Criar políticas RLS para public.documentos_conhecimento (acesso CRUD completo para operadores)
CREATE POLICY "Operadores possuem acesso completo aos documentos" ON public.documentos_conhecimento
FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

-- 8. Inserir o bucket privado 'documentos-conhecimento'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documentos-conhecimento',
    'documentos-conhecimento',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- 9. Criar políticas RLS para o bucket 'documentos-conhecimento' na tabela storage.objects
CREATE POLICY "Leitura de documentos por operadores" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'documentos-conhecimento'
    AND public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

CREATE POLICY "Upload de documentos por operadores" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'documentos-conhecimento'
    AND public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

CREATE POLICY "Exclusao de documentos por operadores" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'documentos-conhecimento'
    AND public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);
