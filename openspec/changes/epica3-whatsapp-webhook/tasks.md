# Task Breakdown: Webhook do WhatsApp e Mensagens de Saída (Épica 3)

**ID da Mudança:** `epica3-whatsapp-webhook`  
**Status:** `Concluído`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador deve solicitar autorização do usuário antes de aplicar as mudanças)  

*Justificativa:* O escopo da Épica 3 envolve migração de banco de dados, a implementação do webhook completo de recebimento do WhatsApp no Next.js (validação de handshake, validação HMAC-SHA256, detecção de duplicados, validação de celular de Curitiba, auto-registro do cliente e download/upload de mídias), além de um utilitário robusto para envio de mensagens que calcula a janela de 24 horas e um script de testes de integração completo. Estima-se um total aproximado de 500 a 600 linhas de código adicionadas ou modificadas.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Database Migration & Outbound Send Utility
*   **Descrição:** Criação da migração que insere a coluna `whatsapp_mensagem_id` na tabela `mensagens` e desenvolvimento do utilitário `src/lib/whatsapp/send.ts` responsável pelo disparo de mensagens ativas e passivas seguindo a regra da janela de 24 horas da Meta.
*   **Riscos associados:** Bloqueio indevido de mensagens de texto livre caso o cálculo da janela de 24 horas tenha falhas de timezone (UTC vs local).

### Work Unit 2: Webhook Route Handler
*   **Descrição:** Desenvolvimento do endpoint `src/app/api/webhooks/whatsapp/route.ts` contemplando o GET (handshake de verificação) e o POST (processamento de mensagens de entrada, verificação de assinatura HMAC-SHA256, verificação de idempotência, filtro de status, validação de DDD 41 de Curitiba, auto-registro de cliente sem conta prévia, busca/criação de conversa ativa e upload de mídias para o bucket `chat-midias`).
*   **Riscos associados:** Consumo excessivo de memória/timeout ao baixar mídias grandes, falhas na assinatura HMAC devido ao tratamento de encoding do body bruto.

### Work Unit 3: Verification & Integration Tests
*   **Descrição:** Implementação de script independente de teste de integração em `scripts/test-webhook-integration.js` para simular requisições de webhook (incluindo assinaturas HMAC válidas e corrompidas, mensagens duplicadas, fluxo de conversa fechada e testes de envio pós-janela de 24h).
*   **Riscos associados:** Necessidade de mocks realistas das chamadas de API da Meta para evitar requisições reais e custos.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: DB & Utilities (Banco de Dados & Utilitários)

- [x] **1.1** Criar o arquivo de migração `supabase/migrations/20260704150000_epica3_whatsapp_webhook.sql` para adicionar a coluna `whatsapp_mensagem_id` (VARCHAR(100), UNIQUE) à tabela `public.mensagens`.
- [x] **1.2** Criar o utilitário `src/lib/whatsapp/send.ts` para encapsular a integração de saída com a Meta Cloud API.
- [x] **1.3** Implementar a lógica de verificação da janela de 24 horas na função `enviarMensagemWhatsapp`: obter a data da última mensagem enviada pelo cliente (`remetente = 'cliente'`) na conversa e calcular o intervalo de tempo.
- [x] **1.4** Implementar a restrição de envio na janela de 24 horas: se o intervalo for maior que 24 horas, exigir obrigatoriamente um `templateName` homologado; se for menor ou igual, permitir texto livre ou envio de arquivos locais (gerando URL assinada temporária para o bucket `chat-midias`).
- [x] **1.5** Integrar a inserção automática no banco de dados da mensagem de saída usando o `createAdminClient` do Supabase com o `whatsapp_mensagem_id` retornado pela chamada da API da Meta.

### Fase 2: Webhook Handler (Tratamento do Webhook da Meta)

- [x] **2.1** Desenvolver a rota GET em `src/app/api/webhooks/whatsapp/route.ts` para processar a verificação de handshake da Meta, comparando `hub.verify_token` com a variável `WHATSAPP_VERIFY_TOKEN`.
- [x] **2.2** Configurar o tratamento do corpo bruto (raw body) da requisição POST na rota de webhook para permitir o cálculo exato do hash HMAC-SHA256.
- [x] **2.3** Implementar a validação de assinatura de segurança comparando o header `x-hub-signature-256` com o HMAC-SHA256 computado a partir do segredo `WHATSAPP_APP_SECRET` usando `crypto.timingSafeEqual`.
- [x] **2.4** Adicionar mecanismo de idempotência: verificar se `whatsapp_mensagem_id` já existe na tabela `public.mensagens` e ignorar com status 200 se for duplicada.
- [x] **2.5** Filtrar notificações de status (lida, entregue, etc.), retornando status 200 OK sem processamento de nova mensagem.
- [x] **2.6** Aplicar validação de regex do telefone do cliente para Curitiba (`^55419[0-9]{8}$`). Descartar silenciosamente mensagens de telefones fora do padrão.
- [x] **2.7** Implementar o auto-registro inteligente do cliente: se o telefone for válido e não possuir registro na tabela `public.clientes`, realizar a inserção com `usuario_id = NULL` e `nome = 'Contato WhatsApp'`.
- [x] **2.8** Implementar a busca ou criação de conversa ativa (`status = 'ia_atendendo'` e `ia_ativa = TRUE`) para o cliente identificado.
- [x] **2.9** Implementar a ingestão de mídias: caso a mensagem possua anexo (`image`, `audio`, `document`), consultar a URL de download na Meta API, efetuar o download e salvar o arquivo no bucket privado `chat-midias` via `createAdminClient` do Supabase, definindo a URL resultante na coluna `url_anexo`.
- [x] **2.10** Persistir a nova mensagem recebida na tabela `public.mensagens` relacionando-a à conversa ativa encontrada ou criada.

### Fase 3: Testing & Validation (Testes de Integração e Validação)

- [x] **3.1** Criar o script de testes de integração em `scripts/test-webhook-integration.js` usando chamadas locais contra o endpoint da API para simular eventos de entrada.
- [x] **3.2** Escrever cenários de teste para validação HMAC-SHA256 (assinaturas corretas devem ser processadas, assinaturas inválidas devem retornar status 401/403).
- [x] **3.3** Escrever cenários de teste para prevenção de duplicidade (duas requisições idênticas devem resultar em apenas uma gravação no banco).
- [x] **3.4** Escrever cenários para validar o comportamento com conversas fechadas (verificar se o webhook reabre ou inicia uma nova conversa ativa ao receber uma mensagem de entrada do cliente).
- [x] **3.5** Escrever cenários de teste para validação da janela de 24 horas no utilitário de saída (garantir rejeição de texto livre fora da janela e sucesso no envio com templates).

### Fase 4: Cleanup & LGPD compliance (Auditoria & Segurança)

- [x] **4.1** Revisar e remover qualquer dump em formato de log de dados pessoais (PII), tais como telefones ou conteúdo de mensagens em texto plano nos servidores de logs de produção.
- [x] **4.2** Garantir que arquivos temporários baixados durante o fluxo de ingestão de mídias sejam propriamente limpos e removidos do sistema de arquivos após o upload para o Supabase Storage.
- [x] **4.3** Validar que todas as variáveis sensíveis (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) estejam declaradas e validadas no servidor.
