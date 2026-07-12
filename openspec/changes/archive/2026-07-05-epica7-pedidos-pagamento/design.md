# Desenho Técnico: Integração de Pedidos e Pagamentos com Mercado Pago (Épica 7)

**ID da Mudança:** `epica7-pedidos-pagamento`  
**Status:** `Pendente de Aprovação`

---

## 1. Estratégia Técnica e Fluxo de Integração

Esta Épica integra o fluxo de pagamento do Checkout Pro do Mercado Pago (Sandbox) ao sistema de pedidos, incluindo processamento assíncrono de notificações de webhook e sincronização com o Google Calendar.

### 1.1. Fluxo de Criação de Preferência de Pagamento

```text
[Cliente Web / Portal]
       |
       v
1. Invoca Server Action `gerarPreferenciaPagamento(pedidoId)`
       |
       +---> [Validar Existência do Pedido no Banco]
       |
       +---> [Verificar Token do Mercado Pago (MP)]
       |           |
       |           +---> [Modo MOCK] (Token ausente/placeholder)
       |           |        |
       |           |        +---> Gera ID `mock_pref_${pedidoId}`
       |           |        +---> Atualiza pedidos.mercado_pago_preferencia_id
       |           |        +---> Retorna url mock sandbox
       |           |
       |           +---> [Modo Real] (Token válido)
       |                    |
       |                    +---> POST https://api.mercadopago.com/checkout/preferences
       |                    +---> Salva ID real retornado no banco
       |                    +---> Retorna sandbox_init_point / init_point
       v
Redireciona Cliente ao Mercado Pago
```

### 1.2. Fluxo do Webhook de Confirmação de Pagamento

```text
[Webhook MP] (POST /api/webhooks/mercadopago)
       |
       v
1. Responde HTTP 200 OK imediatamente (Evita timeouts e retentativas)
       |
       v
2. Dispara processo assíncrono em segundo plano (Background Promise)
       |
       v
3. GET https://api.mercadopago.com/v1/payments/${paymentId} (Valida dados)
       |
       v
4. Atualiza DB via `createAdminClient` (Bypass de RLS)
       |
       +---> Se "approved":
       |       - pedidos.status_pagamento = 'aprovado'
       |       - pedidos.status = 'confirmado'
       |       - Atualiza/Cria Evento no Google Calendar (Adiciona prefixo `[PAGO]`)
       |
       +---> Se "rejected"/"cancelled":
               - pedidos.status_pagamento = 'rejeitado'
```

---

## 2. Decisões de Arquitetura

| Componente | Opção Escolhida | Justificativa |
| :--- | :--- | :--- |
| **Cliente HTTP** | Chamadas diretas usando `fetch` nativo | Reduz dependências externas pesadas (sem SDK), otimiza tamanho da build e oferece controle total de timeouts. |
| **Bypass RLS Webhook** | `createAdminClient` (Service Role Key) | O webhook do Mercado Pago chama anonimamente (sem autenticação do usuário). É necessário burlar a RLS estritamente nesta operação. |
| **Fila Assíncrona** | Processo não-bloqueante via Promises no Node.js | Evita bloqueios de requisições ao Meta/MP e atrasos no retorno do status `200 OK`. |
| **Resiliência do GCal** | Captura total de erros (`try/catch`) | Falhas na API do Google Calendar não devem impedir a confirmação de pagamento do pedido. |

---

## 3. Estrutura do Banco de Dados e Segurança (RLS)

A tabela `public.pedidos` e suas tabelas relacionadas já utilizam nomes de colunas em **Português do Brasil (pt-BR)**.

### 3.1. RLS na Tabela `public.pedidos`

A política RLS garante que o cliente comum só leia seus próprios registros e proíbe alterações diretas nas colunas de controle:

```sql
-- Políticas para a tabela public.pedidos
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- 1. Leitura restringida
CREATE POLICY "Clientes leem seus proprios pedidos" ON public.pedidos 
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clientes 
        WHERE clientes.id = pedidos.cliente_id 
        AND clientes.usuario_id = auth.uid()
    )
);

-- 2. Escrita proibida para clientes comuns (apenas leitura do seu status)
-- Operações de atualização e inserção são restritas a operadores autenticados ou via Service Role (Webhook)
CREATE POLICY "Operadores tem acesso total a pedidos" ON public.pedidos 
FOR ALL TO authenticated
USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
)
WITH CHECK (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);
```

---

## 4. Detalhes de Implementação

### 4.1. Server Action: `gerarPreferenciaPagamento`
Local: `src/app/actions/pedidos.ts`

```typescript
export async function gerarPreferenciaPagamento(pedidoId: string) {
  // 1. Busca detalhes do pedido e cliente no banco usando cliente autenticado
  // 2. Valida se o token MERCADO_PAGO_ACCESS_TOKEN é real ou placeholder
  // 3. Mapeia itens convertendo centavos para decimais: preco_centavos / 100
  // 4. Executa requisição POST para:
  //    https://api.mercadopago.com/checkout/preferences
  //    Headers: Authorization: Bearer ${MERCADO_PAGO_ACCESS_TOKEN}
  //    Body: external_reference, items, back_urls, notification_url
  // 5. Salva mercado_pago_preferencia_id na tabela pedidos
  // 6. Retorna URL de checkout (sandbox_init_point)
}
```

### 4.2. Webhook: `/api/webhooks/mercadopago`
Local: `src/app/api/webhooks/mercadopago/route.ts`

O handler responderá HTTP `200 OK` imediatamente. Em segundo plano, uma rotina executará a validação do status:

```typescript
export async function POST(req: Request) {
  const body = await req.json();
  
  // 1. Retorna 200 OK imediatamente para evitar retentativas por timeout do MP
  const response = NextResponse.json({ status: 'received' }, { status: 200 });
  
  // 2. Executa processamento assíncrono em segundo plano
  (async () => {
    try {
      const paymentId = body.data?.id;
      const topic = body.type || body.topic;
      if (topic !== 'payment' || !paymentId) return;

      // Buscar detalhes na API do Mercado Pago
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}` }
      });
      const paymentData = await res.json();
      
      const pedidoId = paymentData.external_reference;
      const status = paymentData.status; // ex: 'approved', 'rejected'
      
      const supabase = createAdminClient(); // Ignora RLS para atualizar
      
      if (status === 'approved') {
        await supabase.from('pedidos')
          .update({ status_pagamento: 'aprovado', status: 'confirmado' })
          .eq('id', pedidoId);
          
        // Sincronização Google Calendar
        await atualizarOuAgendarCalendario(pedidoId, supabase);
      } else if (status === 'rejected' || status === 'cancelled') {
        await supabase.from('pedidos')
          .update({ status_pagamento: 'rejeitado' })
          .eq('id', pedidoId);
      }
    } catch (err) {
      console.error('[Mercado Pago Webhook Background Error]:', err);
    }
  })();

  return response;
}
```

### 4.3. Sincronização com o Google Calendar
Local: `src/lib/calendar/google.ts`

Será exportada uma nova função para atualizar eventos existentes:

```typescript
export async function atualizarPedidoNoCalendarioComoPago(pedidoId: string, googleEventId: string): Promise<boolean> {
  // 1. Instancia o cliente da Google Calendar API (Service Account)
  // 2. Busca detalhes mínimos do pedido para remontar o título
  // 3. Executa calendar.events.patch informando summary: "[PAGO] " + titulo
  // 4. Retorna true em caso de sucesso, captura erros de rede/API de forma resiliente
}
```

### 4.4. Estratégia de Mock
Se `MERCADO_PAGO_ACCESS_TOKEN` for ausente ou placeholder:
- O ID gerado será `mock_pref_${pedidoId}`.
- A URL retornada será `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_pref_${pedidoId}`.
- O webhook pode ser testado manualmente enviando um POST mockado simulando o retorno aprovado para atualizar o banco.
