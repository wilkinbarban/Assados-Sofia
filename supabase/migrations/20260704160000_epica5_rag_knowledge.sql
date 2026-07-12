-- Migração para Base de Conhecimento e RAG (Épica 5)
-- ID: 20260704160000_epica5_rag_knowledge

-- 1. Criação da tabela de base de conhecimento
CREATE TABLE public.base_conhecimento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT NOT NULL,
    tags VARCHAR(100)[] NOT NULL DEFAULT '{}',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Trigger de atualização de timestamp
CREATE TRIGGER tr_base_conhecimento_atualizar_data
BEFORE UPDATE ON public.base_conhecimento
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 3. Full-Text Search (FTS) em português brasileiro
ALTER TABLE public.base_conhecimento
ADD COLUMN busca_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(conteudo, ''))
) STORED;

CREATE INDEX idx_base_conhecimento_busca_vector ON public.base_conhecimento USING GIN(busca_vector);

-- 4. Função de busca com SECURITY DEFINER (bypass RLS na consulta RAG)
CREATE OR REPLACE FUNCTION public.buscar_artigos_relevantes(query_text TEXT)
RETURNS SETOF public.base_conhecimento AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.base_conhecimento
    WHERE ativo = TRUE
      AND busca_vector @@ plainto_tsquery('portuguese', query_text)
    ORDER BY ts_rank_cd(busca_vector, plainto_tsquery('portuguese', query_text)) DESC
    LIMIT 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS: Acesso CRUD restrito a operadores do sistema
ALTER TABLE public.base_conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operadores possuem acesso completo" ON public.base_conhecimento
FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));
