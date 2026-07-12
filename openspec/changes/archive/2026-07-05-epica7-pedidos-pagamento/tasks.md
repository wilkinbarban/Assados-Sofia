# Task Breakdown: Pedidos & Mercado Pago (Épica 7)

**ID da Mudança:** `epica7-pedidos-pagamento`  
**Status:** `Concluído`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** Medium-High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador solicita autorização do usuário antes de aplicar as mudanças)  

*Justificativa:* A Épica 7 engloba a implementação da Server Action de geração de preferências (com lógica de fallback mock), a criação de um endpoint público de webhook (com processamento assíncrono em background e bypass de RLS via Service Role), a extensão do serviço do Google Calendar para atualização de eventos existentes com o prefixo `[PAGO]` e a criação de uma suíte de testes de integração e segurança abrangente. Estima-se que as modificações e novos arquivos alcancem aproximadamente 450 a 500 linhas de código.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Preference Generation Server Action
*   **Descrição:** Atualização da Server Action `src/app/actions/pedidos.ts` para implementar `gerarPreferenciaPagamento` integrado ao Mercado Pago Checkout Pro (Sandbox), convertendo centavos para decimais de Real e tratando o modo mock se a credencial `MERCADO_PAGO_ACCESS_TOKEN` for ausente ou placeholder.
*   **Riscos associados:** Falha na conversão numérica de centavos para decimais, timeouts na API externa do Mercado Pago, vazamento de credenciais na construção de requisições.

### Work Unit 2: Public Webhook Route Handler
*   **Descrição:** Criação do Route Handler `/api/webhooks/mercadopago` em `src/app/api/webhooks/mercadopago/route.ts` para receber notificações IPN de pagamento, respondendo `200 OK` imediatamente para evitar retentativas e disparando a validação assíncrona dos dados do pagamento e a atualização do banco de dados (ignorando RLS via cliente de admin).
*   **Riscos associados:** Perda de dados devido a timeouts se não respondido de imediato, concorrência de banco, falha na decodificação do status de pagamento do payload.

### Work Unit 3: Google Calendar Updates Integration
*   **Descrição:** Criação do helper `atualizarPedidoNoCalendarioComoPago` em `src/lib/calendar/google.ts` para ler os detalhes do pedido e fazer o patch no evento correspondente do Google Calendar adicionando o prefixo `[PAGO]` ao resumo (summary). Integração deste fluxo no webhook após aprovação do pagamento.
*   **Riscos associados:** Falha na autenticação da Service Account, estouro da cota da API da Google, inconsistência se o evento no calendário original não for encontrado.

### Work Unit 4: Integration & Security Tests
*   **Descrição:** Desenvolvimento do script `scripts/test-payment-integration.js` para testar os fluxos ponta a ponta em ambiente sandbox/mock: geração de preferências, callback do webhook, atualização do banco e do calendário, restrições RLS de leitura/escrita e conformidade LGPD sobre auditoria de logs (PII).
*   **Riscos associados:** Cobertura de testes insuficiente para caminhos de erro, testes lentos ou instáveis devido a conexões externas não mockadas por completo.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: Preference Generation (Geração de Preferência)

- [x] **1.1** Abrir ou criar `src/app/actions/pedidos.ts` e exportar a Server Action `gerarPreferenciaPagamento(pedidoId: string)`.
- [x] **1.2** Implementar validação de autenticação e papel do usuário (garantir que apenas o cliente dono do pedido ou operadores autorizados possam gerar a preferência).
- [x] **1.3** Consultar os dados do pedido (`public.pedidos`), cliente (`public.clientes`) e itens (`public.itens_pedido`) necessários no banco de dados.
- [x] **1.4** Validar se o token `MERCADO_PAGO_ACCESS_TOKEN` está configurado no ambiente. Se for ausente ou placeholder, ativar o modo de mock:
    - Retornar uma URL simulada `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_pref_${pedidoId}`.
    - Persistir no banco `mercado_pago_preferencia_id = 'mock_pref_' + pedidoId`.
- [x] **1.5** Para o modo real, preparar os dados convertendo centavos para decimal (`preco_centavos / 100`) para itens e taxas de entrega (`taxa_entrega_centavos`).
- [x] **1.6** Chamar a API do Mercado Pago via `fetch` POST para `https://api.mercadopago.com/checkout/preferences` incluindo os cabeçalhos de autorização e payload (`items`, `back_urls`, `external_reference` como `pedidoId` e `notification_url` como webhook público).
- [x] **1.7** Persistir o ID retornado na coluna `mercado_pago_preferencia_id` da tabela `public.pedidos`.
- [x] **1.8** Retornar a URL de checkout (`init_point` ou `sandbox_init_point`) para redirecionamento.

### Fase 2: Webhook Endpoint (Endpoint de Webhook)

- [x] **2.1** Criar a rota pública de webhook `src/app/api/webhooks/mercadopago/route.ts` aceitando requisições do tipo POST.
- [x] **2.2** Extrair o `topic`/`type` e o ID do pagamento (`data.id`) a partir do payload recebido.
- [x] **2.3** Responder imediatamente à requisição do Mercado Pago com HTTP `200 OK` (`NextResponse.json({ status: 'received' }, { status: 200 })`) para evitar requisições repetidas.
- [x] **2.4** Iniciar uma Promise de execução em background assíncrona não-bloqueante.
- [x] **2.5** Consultar a API do Mercado Pago em `https://api.mercadopago.com/v1/payments/${paymentId}` usando o token para buscar as propriedades do pagamento.
- [x] **2.6** Extrair o status do pagamento (`approved`, `rejected`, `cancelled`) e o ID do pedido (`external_reference`).
- [x] **2.7** Instanciar o cliente admin do Supabase (`createAdminClient`) para contornar a RLS e atualizar a tabela `public.pedidos`:
    - Se status for `approved`: definir `status_pagamento = 'aprovado'` e `status = 'confirmado'`.
    - Se status for `rejected` or `cancelled`: definir `status_pagamento = 'rejeitado'`.
- [x] **2.8** Implementar tratamento completo de erros no background loop e garantir que nenhuma PII ou segredo seja vazado nos logs.

### Fase 3: Google Calendar Sync (Sincronização com Google Calendar)

- [x] **3.1** Abrir `src/lib/calendar/google.ts`.
- [x] **3.2** Implementar e exportar a função `atualizarPedidoNoCalendarioComoPago(pedidoId: string, googleEventId: string): Promise<boolean>`.
- [x] **3.3** Iniciar conexão autenticada com a API do Google Calendar usando credenciais de Service Account.
- [x] **3.4** Se no modo mock (ausência de chaves de calendário), simular a latência de 200ms e retornar sucesso imediato.
- [x] **3.5** Se no modo real, fazer a chamada `calendar.events.patch` atualizando o título (summary) com o prefixo `[PAGO]`.
- [x] **3.6** Garantir tratamento resiliente de erros via `try/catch` para que problemas de API de calendário apenas gerem alertas e logs, sem reverter as transações no banco de dados.
- [x] **3.7** Acoplar a chamada do `atualizarPedidoNoCalendarioComoPago` no webhook de Mercado Pago (Fase 2) quando o pagamento for aprovado. Se `google_event_id` for nulo, invocar primeiro `agendarPedidoNoCalendario(pedidoId)` e atualizar a coluna `google_event_id` correspondente.

### Fase 4: Integration Testing (Testes de Integração)

- [x] **4.1** Criar o arquivo de teste `scripts/test-payment-integration.js`.
- [x] **4.2** Implementar teste de geração de preferência simulando chamada no modo mock e no modo real (com mocks de chamadas HTTP se necessário).
- [x] **4.3** Implementar teste do Webhook Mercado Pago disparando POST simulado à rota `/api/webhooks/mercadopago` e verificando se:
    - Retorna `200 OK` imediatamente.
    - Atualiza os status corretos na tabela `pedidos` via Service Role.
    - Modifica ou agenda o evento correspondente no Google Calendar.
- [x] **4.4** Implementar testes de RLS na tabela `pedidos`, verificando se:
    - O cliente comum não consegue alterar os campos `status_pagamento`, `status`, `mercado_pago_preferencia_id` ou `google_event_id`.
    - O cliente comum não consegue ler dados de pedidos de outros clientes.
- [x] **4.5** Adicionar verificação de vazamento de logs PII, validando que informações sensíveis não são exibidas na saída de erros ou de auditoria do terminal.
