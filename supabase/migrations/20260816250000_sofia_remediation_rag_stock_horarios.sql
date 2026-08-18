-- ============================================================
-- Migração: Remediação RAG, Base de Conhecimento e Estoque de Produtos
-- ID: 20260816250000_sofia_remediation_rag_stock_horarios
-- ============================================================

-- 1. Extensão unaccent e função wrapper imutável
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text AS $$
SELECT public.unaccent('public.unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- 2. Atualizar tabela base_conhecimento com busca_vector unaccented
DO $$
BEGIN
    ALTER TABLE public.base_conhecimento DROP COLUMN IF EXISTS busca_vector;
    
    ALTER TABLE public.base_conhecimento
    ADD COLUMN busca_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('portuguese', public.f_unaccent(coalesce(titulo, '') || ' ' || coalesce(conteudo, '')))
    ) STORED;
EXCEPTION
    WHEN others THEN
        null;
END $$;

CREATE INDEX IF NOT EXISTS idx_base_conhecimento_busca_vector ON public.base_conhecimento USING GIN(busca_vector);

-- 3. Recriação da RPC buscar_artigos_relevantes com OR e prefix matching
CREATE OR REPLACE FUNCTION public.buscar_artigos_relevantes(query_text TEXT)
RETURNS SETOF public.base_conhecimento AS $$
DECLARE
    v_clean_text TEXT;
    v_query_terms TEXT;
    v_tsquery tsquery;
BEGIN
    v_clean_text := trim(coalesce(query_text, ''));
    IF v_clean_text = '' THEN
        RETURN;
    END IF;

    -- Extrair termos significativos com comprimento >= 3
    BEGIN
        SELECT string_agg(quote_literal(word) || ':*', ' | ')
        INTO v_query_terms
        FROM regexp_split_to_table(regexp_replace(public.f_unaccent(v_clean_text), '[^\w\s]', ' ', 'g'), '\s+') AS word
        WHERE length(word) >= 3;

        IF v_query_terms IS NOT NULL AND v_query_terms <> '' THEN
            v_tsquery := to_tsquery('portuguese', v_query_terms);
        END IF;
    EXCEPTION
        WHEN others THEN
            v_tsquery := NULL;
    END;

    IF v_tsquery IS NOT NULL THEN
        RETURN QUERY
        SELECT *
        FROM public.base_conhecimento
        WHERE ativo = TRUE
          AND (
              busca_vector @@ v_tsquery
              OR public.f_unaccent(titulo) ILIKE '%' || public.f_unaccent(v_clean_text) || '%'
              OR public.f_unaccent(conteudo) ILIKE '%' || public.f_unaccent(v_clean_text) || '%'
          )
        ORDER BY ts_rank_cd(busca_vector, v_tsquery) DESC, data_atualizacao DESC
        LIMIT 4;
    ELSE
        -- Fallback seguro para ILIKE
        RETURN QUERY
        SELECT *
        FROM public.base_conhecimento
        WHERE ativo = TRUE
          AND (
              public.f_unaccent(titulo) ILIKE '%' || public.f_unaccent(v_clean_text) || '%'
              OR public.f_unaccent(conteudo) ILIKE '%' || public.f_unaccent(v_clean_text) || '%'
          )
        ORDER BY data_atualizacao DESC
        LIMIT 4;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atualizar buscar_produtos_disponiveis com quantidade_estoque
DROP FUNCTION IF EXISTS public.buscar_produtos_disponiveis();

CREATE OR REPLACE FUNCTION public.buscar_produtos_disponiveis()
RETURNS TABLE(
  id UUID,
  nome VARCHAR,
  descricao TEXT,
  preco_centavos INTEGER,
  url_imagem TEXT,
  url_imagem_thumb TEXT,
  quantidade_estoque INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb, p.quantidade_estoque
  FROM public.produtos p
  WHERE p.ativo = true
    AND (p.controlar_estoque = false OR p.quantidade_estoque > 0)
  ORDER BY NULLIF(p.ordem_exibicao, 0) ASC NULLS LAST, p.nome ASC, p.id ASC;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.buscar_artigos_relevantes(TEXT) TO postgres, service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.buscar_produtos_disponiveis() TO postgres, service_role, authenticated, anon;
