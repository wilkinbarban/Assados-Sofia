# Desenho Técnico: CRM, Vendas, Pedidos e Google Calendar (Épica 6)

**ID da Mudança:** `epica6-crm-sales`  
**Status:** `Aprovado`

---

## 1. Estratégia Técnica e Fluxo

Esta épica integra o gerenciamento do catálogo de produtos, o enriquecimento de dados de CRM do cliente e a emissão rápida de pedidos de venda por parte dos operadores, concluindo com o agendamento resiliente no Google Calendar.

```text
[Operador (Chat/UI)] 
       |
       +---> 1. Atualiza Notas/Tags/Endereço ---> [Server Action: atualizarClienteCrm]
       |
       +---> 2. Cria Pedido (Modal)         ---> [Server Action: criarPedidoOperador]
                                                         | (Insere Pedido/Itens)
                                                         v
                                                [Status: 'novo']
       |
       +---> 3. Confirma Pedido             ---> [Server Action: confirmarPedidoOperador]
                                                         |
                                                         +---> [Status -> 'confirmado']
                                                         |
                                                         +---> (In-Code Try/Catch)
                                                                     |
                                                                     v
                                                          [Google Calendar API]
                                                                     |
                                              +----------------------+----------------------+
                                              | (Sucesso)                                   | (Falha/Offline)
                                              v                                             v
                                  [Grava google_event_id]                        [Grava google_event_id = NULL]
                                  [Retorna Sucesso]                              [Retorna Sucesso (Log erro)]
```

---

## 2. Banco de Dados e Migração SQL

Arquivo: `supabase/migrations/20260704170000_epica6_crm_sales.sql`

```sql
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
```

---

## 3. Server Actions (`src/app/actions/`)

### A. Catálogo (`produtos.ts`)
*   `criarProduto(data)` & `atualizarProduto(id, data)` & `alternarStatusProduto(id, ativo)`: Valida se o usuário logado possui a role `admin` ou `supervisor` via `public.tem_funcoes` antes de persistir alterações no banco.

### B. CRM Cliente (`clientes.ts`)
*   `atualizarClienteCrm(clienteId, data: { endereco?, tags?, notas? })`: Permite atualizar os campos de CRM do cliente. Requer role de operador (`admin`/`supervisor`/`vendedor`) ou que o cliente atualizando seja o proprietário da conta (`auth.uid() = usuario_id`).

### C. Pedidos (`pedidos.ts`)
*   `criarPedidoOperador(data)`:
    1.  Verifica autenticação e papel (`admin`, `supervisor`, `vendedor`).
    2.  Busca o preço atual em centavos dos produtos envolvidos na tabela `public.produtos`.
    3.  Calcula `total_produtos_centavos` e `total_pedido_centavos`.
    4.  Cria o registro em `pedidos` (status = `'novo'`) e insere os registros correspondentes em `itens_pedido` com o preço unitário histórico daquele momento.
*   `confirmarPedidoOperador(pedidoId)`:
    1.  Transiciona o status do pedido para `'confirmado'`.
    2.  Invoca assincronamente a integração do Google Calendar: `agendarPedidoNoCalendario(pedidoId)`.
    3.  Atualiza a coluna `google_event_id` com o retorno obtido.

---

## 4. Serviço Google Calendar (`src/lib/calendar/google.ts`)

A integração utiliza o pacote `googleapis` configurado com uma conta de serviço para autenticação:

```typescript
import { google } from 'googleapis';

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  undefined,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);

const calendar = google.calendar({ version: 'v3', auth });
```

### Função `agendarPedidoNoCalendario(pedidoId: string): Promise<string | null>`
1.  Busca os detalhes do pedido (`pedidos` e `itens_pedido`) juntamente com os dados do cliente associado (`clientes`).
2.  Formata um corpo descritivo (em português):
    *   **Título do Evento:** `Pedido #[ID-Curto] - [Nome do Cliente] ([TipoEntrega])`
    *   **Descrição:** Detalha itens, preços, endereço de entrega, telefone e o valor total formatado em BRL.
3.  Cria o evento na agenda `GOOGLE_CALENDAR_ID` com fuso horário `America/Sao_Paulo`.
4.  **Resiliência:** O bloco de execução é envolvido em `try/catch`. Caso ocorra qualquer erro da API do Google Calendar, captura-se a exceção e retorna-se `null`, garantindo que o fluxo chamador (confirmação do pedido no DB) não falhe nem reverta a transação.

---

## 5. Componentes e Páginas de Frontend

1.  **Sidebar CRM (`src/components/operator/ClientCrmPanel.tsx`)**:
    *   Exibe e permite a edição dinâmica de notas (textarea), tags (input interativo com pills) e endereço do cliente selecionado no chat do operador.
    *   Aplica debouncing ou botão "Salvar Alterações" conectado à action `atualizarClienteCrm`.
2.  **Modal Criar Pedido (`src/components/operator/CreateOrderModal.tsx`)**:
    *   Modal flutuante aberto no chat ativo.
    *   Combobox/Seleção de produtos ativos.
    *   Calcula dinamicamente e renderiza o subtotal dos itens e total do pedido em tempo real.
    *   Dispara `criarPedidoOperador` ao submeter.
3.  **Catálogo CRUD (`src/app/atendimento/produtos/page.tsx`)**:
    *   Disponível para administradores e supervisores.
    *   Exibe tabela com produtos cadastrados, busca de texto, switch para ativar/desativar (`ativo`) e botão para criar/editar produto.

---

## 6. Trade-offs de Desenho

| Decisão | Prós | Contras | Escolha |
| :--- | :--- | :--- | :--- |
| **Integração Síncrona Resiliente (Try/Catch)** | Mantém o status do banco de dados íntegro e atualizado instantaneamente, mesmo com API do Google fora do ar. | A sincronização do calendário pode atrasar se a rede estiver lenta durante a Server Action. | **Sim** (Mais simples e garante consistência do pedido no DB) |
| **Fila Assíncrona Separada (Background worker)** | Resposta imediata na Server Action, isolando completamente a dependência externa do ciclo de vida da requisição HTTP. | Introduz maior complexidade operacional, dependência de workers ativos e filas no Redis. | **Não** (Desnecessário para o volume atual; try/catch atende os requisitos de resiliência) |
