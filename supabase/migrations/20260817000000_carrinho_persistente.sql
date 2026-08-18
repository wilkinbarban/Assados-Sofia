-- Migração para Carrinho de Compras Persistente, Itens e Conversão Atômica em Pedidos (Fase 1)
-- ID: 20260817000000_carrinho_persistente

-- 1. Tabela de Carrinhos
CREATE TABLE IF NOT EXISTS public.carrinhos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    conversa_id UUID REFERENCES public.conversas(id) ON DELETE SET NULL,
    canal VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    status VARCHAR(20) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'convertido', 'cancelado', 'expirado')),
    subtotal_centavos INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_centavos >= 0),
    desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
    taxa_entrega_centavos INTEGER NOT NULL DEFAULT 0 CHECK (taxa_entrega_centavos >= 0),
    total_centavos INTEGER NOT NULL DEFAULT 0 CHECK (total_centavos >= 0),
    tipo_entrega public.tipo_entrega NOT NULL DEFAULT 'retirada',
    horario_retirada VARCHAR(10),
    observacoes TEXT,
    data_expiracao TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Garantir que cada cliente tenha no máximo UM carrinho aberto ao mesmo tempo
CREATE UNIQUE INDEX IF NOT EXISTS uidx_carrinho_aberto_por_cliente 
ON public.carrinhos (cliente_id) 
WHERE status = 'aberto';

-- Trigger para atualizar timestamp de data_atualizacao
CREATE TRIGGER tr_carrinhos_atualizar_data
BEFORE UPDATE ON public.carrinhos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 2. Tabela de Itens do Carrinho
CREATE TABLE IF NOT EXISTS public.itens_carrinho (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrinho_id UUID NOT NULL REFERENCES public.carrinhos(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario_centavos INTEGER NOT NULL CHECK (preco_unitario_centavos >= 0),
    preco_total_centavos INTEGER NOT NULL CHECK (preco_total_centavos >= 0),
    observacoes TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uidx_item_produto_por_carrinho UNIQUE (carrinho_id, produto_id)
);

CREATE TRIGGER tr_itens_carrinho_atualizar_data
BEFORE UPDATE ON public.itens_carrinho
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 3. Função e Trigger para Recalcular Totais do Carrinho Automaticamente
CREATE OR REPLACE FUNCTION public.recalcular_totais_carrinho()
RETURNS TRIGGER AS $$
DECLARE
    v_carrinho_id UUID;
    v_subtotal INTEGER := 0;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_carrinho_id := OLD.carrinho_id;
    ELSE
        v_carrinho_id := NEW.carrinho_id;
    END IF;

    -- Calcular novo subtotal a partir dos itens
    SELECT COALESCE(SUM(preco_total_centavos), 0)
    INTO v_subtotal
    FROM public.itens_carrinho
    WHERE carrinho_id = v_carrinho_id;

    -- Atualizar o carrinho com subtotal e total
    UPDATE public.carrinhos
    SET 
        subtotal_centavos = v_subtotal,
        total_centavos = GREATEST(0, v_subtotal - desconto_centavos + taxa_entrega_centavos),
        data_atualizacao = CURRENT_TIMESTAMP
    WHERE id = v_carrinho_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_recalcular_totais_carrinho_ins_upd ON public.itens_carrinho;
CREATE TRIGGER tr_recalcular_totais_carrinho_ins_upd
AFTER INSERT OR UPDATE ON public.itens_carrinho
FOR EACH ROW EXECUTE FUNCTION public.recalcular_totais_carrinho();

DROP TRIGGER IF EXISTS tr_recalcular_totais_carrinho_del ON public.itens_carrinho;
CREATE TRIGGER tr_recalcular_totais_carrinho_del
AFTER DELETE ON public.itens_carrinho
FOR EACH ROW EXECUTE FUNCTION public.recalcular_totais_carrinho();

-- 4. Função Transacional RPC: Converter Carrinho em Pedido com Reserva Atômica de Estoque
CREATE OR REPLACE FUNCTION public.converter_carrinho_em_pedido(
    p_carrinho_id UUID,
    p_meio_pagamento public.meio_pagamento DEFAULT 'pix',
    p_horario_retirada VARCHAR(10) DEFAULT NULL
)
RETURNS TABLE (
    pedido_id UUID,
    status_pedido public.status_pedido,
    total_centavos INTEGER,
    quantidade_itens INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_carrinho RECORD;
    v_pedido_id UUID;
    v_total_itens INTEGER := 0;
    v_correlation_id UUID := gen_random_uuid();
    v_horario_final VARCHAR(10);
BEGIN
    -- 1. Bloquear o carrinho para leitura e atualização concorrente
    SELECT * INTO v_carrinho
    FROM public.carrinhos
    WHERE id = p_carrinho_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING errcode = 'P0002', message = 'CARRINHO_NAO_ENCONTRADO';
    END IF;

    IF v_carrinho.status <> 'aberto' THEN
        RAISE EXCEPTION USING errcode = '23514', message = 'CARRINHO_JA_CONVERTIDO_OU_CANCELADO';
    END IF;

    -- 2. Verificar se há itens no carrinho
    SELECT COUNT(*), COALESCE(SUM(quantidade), 0)
    INTO v_total_itens, v_total_itens
    FROM public.itens_carrinho
    WHERE carrinho_id = p_carrinho_id;

    IF v_total_itens = 0 THEN
        RAISE EXCEPTION USING errcode = '23514', message = 'CARRINHO_VAZIO';
    END IF;

    v_horario_final := COALESCE(p_horario_retirada, v_carrinho.horario_retirada);

    -- 3. Criar o registro oficial de Pedido
    INSERT INTO public.pedidos (
        cliente_id,
        conversa_id,
        status,
        tipo_entrega,
        taxa_entrega_centavos,
        total_produtos_centavos,
        total_pedido_centavos,
        status_pagamento,
        meio_pagamento,
        estoque_estado
    ) VALUES (
        v_carrinho.cliente_id,
        v_carrinho.conversa_id,
        'confirmado',
        v_carrinho.tipo_entrega,
        v_carrinho.taxa_entrega_centavos,
        v_carrinho.subtotal_centavos,
        v_carrinho.total_centavos,
        'pendente',
        p_meio_pagamento,
        'pendente'
    )
    RETURNING id INTO v_pedido_id;

    -- 4. Copiar os itens do carrinho para itens_pedido
    INSERT INTO public.itens_pedido (
        pedido_id,
        produto_id,
        preco_unitario_centavos,
        quantidade
    )
    SELECT 
        v_pedido_id,
        produto_id,
        preco_unitario_centavos,
        quantidade
    FROM public.itens_carrinho
    WHERE carrinho_id = p_carrinho_id;

    -- 5. Executar a reserva transacional de estoque
    PERFORM public.processar_pedido_estoque(v_pedido_id, v_correlation_id, false);

    -- 6. Atualizar status do carrinho para convertido
    UPDATE public.carrinhos
    SET 
        status = 'convertido',
        data_atualizacao = CURRENT_TIMESTAMP
    WHERE id = p_carrinho_id;

    RETURN QUERY
    SELECT 
        v_pedido_id,
        'confirmado'::public.status_pedido,
        v_carrinho.total_centavos,
        v_total_itens;
END;
$$;

-- 5. Row Level Security (RLS)
ALTER TABLE public.carrinhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_carrinho ENABLE ROW LEVEL SECURITY;

-- Políticas para carrinhos:
DROP POLICY IF EXISTS "Clientes gerenciam seus proprios carrinhos" ON public.carrinhos;
CREATE POLICY "Clientes gerenciam seus proprios carrinhos" ON public.carrinhos
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.clientes WHERE id = carrinhos.cliente_id AND usuario_id = auth.uid())
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.clientes WHERE id = carrinhos.cliente_id AND usuario_id = auth.uid())
);

DROP POLICY IF EXISTS "Operadores tem acesso total a carrinhos" ON public.carrinhos;
CREATE POLICY "Operadores tem acesso total a carrinhos" ON public.carrinhos
FOR ALL TO authenticated
USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
)
WITH CHECK (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

-- Políticas para itens_carrinho:
DROP POLICY IF EXISTS "Clientes gerenciam itens de seus proprios carrinhos" ON public.itens_carrinho;
CREATE POLICY "Clientes gerenciam itens de seus proprios carrinhos" ON public.itens_carrinho
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.carrinhos c
        JOIN public.clientes cl ON cl.id = c.cliente_id
        WHERE c.id = itens_carrinho.carrinho_id AND cl.usuario_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.carrinhos c
        JOIN public.clientes cl ON cl.id = c.cliente_id
        WHERE c.id = itens_carrinho.carrinho_id AND cl.usuario_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Operadores tem acesso total a itens do carrinho" ON public.itens_carrinho;
CREATE POLICY "Operadores tem acesso total a itens do carrinho" ON public.itens_carrinho
FOR ALL TO authenticated
USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
)
WITH CHECK (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);
