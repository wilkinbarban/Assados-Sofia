-- Migração para Módulos Horário do Atendimento + Estoque
-- ID: 20260708000000_estoque_horarios

-- ============================================================
-- 1. Tabela horarios_atendimento
-- ============================================================
CREATE TABLE public.horarios_atendimento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_abertura TIME NOT NULL,
    hora_fechamento TIME NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao TIMESTAMPTZ DEFAULT now(),
    data_atualizacao TIMESTAMPTZ DEFAULT now(),
    UNIQUE(dia_semana)
);

CREATE TRIGGER tr_horarios_atendimento_atualizar_data
BEFORE UPDATE ON public.horarios_atendimento
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

ALTER TABLE public.horarios_atendimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública de horários" ON public.horarios_atendimento
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Escrita de horários por admin e supervisor" ON public.horarios_atendimento
FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

GRANT ALL ON public.horarios_atendimento TO postgres, service_role, authenticated, anon;

-- ============================================================
-- 2. Extensão da tabela produtos
-- ============================================================
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS quantidade_estoque INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_estoque >= 0);
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 5 CHECK (estoque_minimo >= 0);
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS controlar_estoque BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS url_imagem_thumb TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS url_imagem_2 TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS url_imagem_2_thumb TEXT;

-- ============================================================
-- 3. ENUM e tabela movimentacoes_estoque
-- ============================================================
CREATE TYPE public.tipo_movimentacao AS ENUM ('entrada', 'saida', 'ajuste', 'cancelamento');

CREATE TABLE public.movimentacoes_estoque (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    tipo public.tipo_movimentacao NOT NULL,
    quantidade INTEGER NOT NULL,
    quantidade_anterior INTEGER NOT NULL,
    quantidade_nova INTEGER NOT NULL,
    motivo TEXT,
    usuario_id UUID REFERENCES auth.users(id),
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
    data_criacao TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de movimentações por operadores" ON public.movimentacoes_estoque
FOR SELECT TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

CREATE POLICY "Escrita de movimentações por operadores" ON public.movimentacoes_estoque
FOR INSERT TO authenticated
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

GRANT ALL ON public.movimentacoes_estoque TO postgres, service_role, authenticated, anon;

-- ============================================================
-- 4. Bucket produto-imagens
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('produto-imagens', 'produto-imagens', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Leitura pública de imagens de produtos" ON storage.objects
FOR SELECT USING (bucket_id = 'produto-imagens');

CREATE POLICY "Upload de imagens por operadores" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'produto-imagens' AND public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

CREATE POLICY "Exclusão de imagens por operadores" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'produto-imagens' AND public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

-- ============================================================
-- 5. RPCs para Sofía
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_produtos_disponiveis()
RETURNS TABLE(id UUID, nome VARCHAR, descricao TEXT, preco_centavos INTEGER, url_imagem TEXT, url_imagem_thumb TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb
    FROM public.produtos p
    WHERE p.ativo = TRUE AND (p.controlar_estoque = FALSE OR p.quantidade_estoque > 0)
    ORDER BY p.nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.buscar_produto_por_nome(p_nome TEXT)
RETURNS TABLE(id UUID, nome VARCHAR, descricao TEXT, preco_centavos INTEGER, url_imagem TEXT, url_imagem_thumb TEXT, quantidade_estoque INTEGER, ativo BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb, p.quantidade_estoque, p.ativo
    FROM public.produtos p
    WHERE p.nome ILIKE '%' || p_nome || '%'
    ORDER BY p.nome
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Inserir configuração MENSAGEM_FORA_HORARIO
-- ============================================================
INSERT INTO public.configuracoes_sistema (chave, valor, eh_segredo)
VALUES (
    'MENSAGEM_FORA_HORARIO',
    'Olá! 😊 Agora estamos fora do nosso horário de atendimento, mas não se preocupe — sua mensagem é muito importante para nós! 🥩

Nosso horário de funcionamento é:
📅 {dias_semana}
🕐 {horario_inicio} às {horario_fim}

Ficaremos felizes em atendê-lo(a) durante esse período. Envie sua mensagem quando estivermos abertos que será um prazer ajudar você com o melhor churrasco de Curitiba! 🍖

Atenciosamente,
Equipe Asados ❤️',
    false
)
ON CONFLICT (chave) DO NOTHING;
