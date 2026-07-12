-- Migração para CRM, Vendas, Pedidos e Google Calendar (Épica 6)
-- ID: 20260704170000_epica6_crm_sales

-- 1. Enums do Pedido
CREATE TYPE public.status_pedido AS ENUM ('novo', 'confirmado', 'entregue', 'cancelado');
CREATE TYPE public.tipo_entrega AS ENUM ('entrega', 'retirada');
CREATE TYPE public.status_pagamento AS ENUM ('pendente', 'aprovado', 'rejeitado', 'reembolsado');
CREATE TYPE public.meio_pagamento AS ENUM ('pix', 'cartao_credito', 'cartao_debito', 'dinheiro');

-- 2. Colunas de CRM adicionadas à tabela clientes (se não existirem)
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS tags VARCHAR(100)[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS notas TEXT,
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;

-- 3. Tabela de Produtos
CREATE TABLE public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    url_imagem TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER tr_produtos_atualizar_data
BEFORE UPDATE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 4. Tabela de Pedidos
CREATE TABLE public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    conversa_id UUID REFERENCES public.conversas(id) ON DELETE SET NULL,
    status public.status_pedido NOT NULL DEFAULT 'novo',
    tipo_entrega public.tipo_entrega NOT NULL DEFAULT 'retirada',
    endereco_entrega TEXT,
    taxa_entrega_centavos INTEGER NOT NULL DEFAULT 0 CHECK (taxa_entrega_centavos >= 0),
    total_produtos_centavos INTEGER NOT NULL CHECK (total_produtos_centavos >= 0),
    total_pedido_centavos INTEGER NOT NULL CHECK (total_pedido_centavos >= 0),
    status_pagamento public.status_pagamento NOT NULL DEFAULT 'pendente',
    meio_pagamento public.meio_pagamento NOT NULL,
    mercado_pago_preferencia_id VARCHAR(100),
    google_event_id VARCHAR(100),
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER tr_pedidos_atualizar_data
BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 5. Tabela de Itens do Pedido
CREATE TABLE public.itens_pedido (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    preco_unitario_centavos INTEGER NOT NULL CHECK (preco_unitario_centavos >= 0),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Row Level Security (RLS) e Políticas
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;

-- Políticas: produtos
CREATE POLICY "Leitura de produtos publica" ON public.produtos FOR SELECT USING (true);
CREATE POLICY "Escrita de produtos por admin ou supervisor" ON public.produtos FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

-- Políticas: pedidos
CREATE POLICY "Clientes leem seus proprios pedidos" ON public.pedidos FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.clientes WHERE id = pedidos.cliente_id AND usuario_id = auth.uid())
);
CREATE POLICY "Operadores tem acesso total a pedidos" ON public.pedidos FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

-- Políticas: itens_pedido
CREATE POLICY "Clientes leem seus proprios itens" ON public.itens_pedido FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.pedidos p
        JOIN public.clientes c ON c.id = p.cliente_id
        WHERE p.id = itens_pedido.pedido_id AND c.usuario_id = auth.uid()
    )
);
CREATE POLICY "Operadores tem acesso total a itens" ON public.itens_pedido FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));

-- Atualizar RLS de clientes para permitir acesso aos operadores
DROP POLICY IF EXISTS "Leitura de clientes próprio ou por admin" ON public.clientes;
DROP POLICY IF EXISTS "Inserção de clientes próprio ou por admin" ON public.clientes;
DROP POLICY IF EXISTS "Alteração de clientes próprio ou por admin" ON public.clientes;

CREATE POLICY "Leitura de clientes proprio ou operadores" ON public.clientes FOR SELECT USING (
    auth.uid() = usuario_id OR public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);
CREATE POLICY "Insercao de clientes proprio ou operadores" ON public.clientes FOR INSERT WITH CHECK (
    auth.uid() = usuario_id OR public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);
CREATE POLICY "Alteracao de clientes proprio ou operadores" ON public.clientes FOR UPDATE USING (
    auth.uid() = usuario_id OR public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
) WITH CHECK (
    auth.uid() = usuario_id OR public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);
