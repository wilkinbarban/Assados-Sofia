# Especificação de Requisitos: Integração do Webhook de WhatsApp com a API de Meta (whatsapp_webhook)

**ID da Mudança:** `epica3-whatsapp-webhook`  
**Domínio:** `whatsapp_webhook`  
**Status:** `Pendente de Revisão`  

---

## 1. Descrição Executiva
Este documento especifica formalmente os requisitos funcionais, de fluxo de dados, segurança e cenários de aceitação para a integração do Webhook de WhatsApp (Meta Cloud API) com o backend do sistema **Asados** (Next.js). O webhook processa mensagens recebidas (texto, áudio, imagens e documentos), realiza o download automático das mídias anexas para o Supabase Storage público/privado, executa o auto-registro inteligente de novos clientes (com restrição estrita ao DDD 41 de Curitiba) e associa as mensagens a conversas ativas. Também define os padrões de envio de mensagens de saída (outbound) usando a API oficial da Meta, respeitando as janelas de conversação de 24 horas.

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Modelagem e Alterações no Banco de Dados
*   **REQ-WHATS-001**: O sistema MUST adicionar na tabela `mensagens` a coluna `whatsapp_mensagem_id` do tipo `VARCHAR(100)` com a restrição de unicidade (`UNIQUE`).
*   **REQ-WHATS-002**: A coluna `whatsapp_mensagem_id` SHALL ser opcional (`NULL`) na tabela para acomodar mensagens internas ou mensagens criadas localmente no portal web antes de receberem o ID de confirmação da Meta.

### 2.2 Verificação do Webhook (GET)
*   **REQ-WHATS-003**: O endpoint GET `/api/webhooks/whatsapp` MUST ser implementado para responder à validação inicial solicitada pela Meta (handshake).
*   **REQ-WHATS-004**: O endpoint MUST extrair os seguintes parâmetros da query string:
    *   `hub.mode`: Modo de assinatura (geralmente `'subscribe'`).
    *   `hub.verify_token`: Token de verificação enviado pela Meta.
    *   `hub.challenge`: Código numérico enviado que deve ser devolvido como resposta.
*   **hub.mode` é exatamente `'subscribe'` e se `hub.verify_token` coincide com a variável de ambiente `WHATSAPP_VERIFY_TOKEN` configurada no servidor.
*   **REQ-WHATS-006**: Se a validação for bem-sucedida, o endpoint MUST responder com status HTTP `200 OK` retornando o valor contido em `hub.challenge` em texto simples (`text/plain`).
*   **REQ-WHATS-007**: Se a validação do token de verificação falhar, o endpoint MUST responder com status HTTP `403 Forbidden` e rejeitar a assinatura.

### 2.3 Processamento de Mensagens Recebidas (POST)
*   **REQ-WHATS-008**: O endpoint POST `/api/webhooks/whatsapp` MUST estar preparado para receber notificações de eventos enviados em tempo real pela Meta.
*   **REQ-WHATS-009**: O webhook MUST verificar a assinatura digital `x-hub-signature-256` presente nos cabeçalhos da requisição, calculando o HMAC-SHA256 do corpo da requisição com a chave secreta `WHATSAPP_APP_SECRET`. Se a assinatura for inválida ou ausente, a requisição MUST ser rejeitada com status HTTP `401 Unauthorized`.
*   **REQ-WHATS-010**: O webhook MUST implementar um mecanismo de idempotência. Para cada objeto de mensagem recebido em `messages`, o sistema MUST consultar se já existe um registro na tabela `mensagens` com o mesmo `whatsapp_mensagem_id`. Caso exista, o webhook MUST ignorar a mensagem duplicada e retornar imediatamente status HTTP `200 OK`.
*   **REQ-WHATS-011**: O sistema MUST extrair e tratar os seguintes formatos de dados em `messages[0]`:
    *   Se for do tipo `text`: O texto da mensagem MUST ser salvo na coluna `mensagens.conteudo` extraído do campo `text.body`.
    *   Se for do tipo `image`, `audio` ou `document`: O sistema MUST extrair o identificador único `media_id` para acionar o fluxo de ingestão de mídias.
*   **REQ-WHATS-012**: O webhook MUST ignorar notificações de alteração de status de envio (tais como `sent`, `delivered` ou `read` contidos no array `statuses`) no que tange a inserção de novos registros na tabela `mensagens`. Tais eventos SHOULD ser registrados apenas em logs de auditoria ou telemetria.

### 2.4 Fluxo de Ingestão de Mídias (Media Ingest)
*   **REQ-WHATS-013**: Ao detectar uma mensagem com anexo (`image`, `audio`, `document`), o sistema MUST consultar os metadados do arquivo chamando o endpoint de consulta da Meta `GET https://graph.facebook.com/v18.0/{media_id}` contendo o cabeçalho de autorização `Authorization: Bearer WHATSAPP_ACCESS_TOKEN`.
*   **REQ-WHATS-014**: O sistema MUST ler a URL temporária de download (`url`) contida na resposta da consulta de metadados.
*   **REQ-WHATS-015**: O sistema MUST fazer o download dos bytes do arquivo de mídia e realizar o upload para o bucket privado `chat-midias` do Supabase Storage.
*   **REQ-WHATS-016**: O nome do arquivo no Supabase Storage MUST ser salvo utilizando um UUID gerado randomicamente, preservando a extensão original correspondente ao tipo MIME (ex: `.png`, `.ogg`, `.pdf`).
*   **REQ-WHATS-017**: Após o upload do arquivo para o bucket privado com sucesso, o link correspondente no Supabase Storage MUST ser gravado na coluna `mensagens.url_anexo`.

### 2.5 Auto-Registro Inteligente de Clientes e Conversas
*   **REQ-WHATS-018**: Para cada mensagem válida processada no webhook, o sistema MUST extrair o telefone do cliente (`messages[0].from`) e o nome de perfil da Meta (`contacts[0].profile.name`).
*   **REQ-WHATS-019**: O telefone de origem MUST ser sanitizado para manter apenas dígitos, devendo conter DDI, DDD e prefixo de Curitiba no formato: `55419XXXXXXXX`.
*   **REQ-WHATS-020**: O webhook MUST validar se o telefone atende ao padrão da expressão regular `^55419[0-9]{8}$`. Se o telefone não pertencer a Curitiba (DDD 41), a mensagem MUST ser descartada e não inserida na base para evitar a violação da restrição de integridade `chk_telefone_curitiba`.
*   **REQ-WHATS-021**: Se o telefone for válido e não estiver registrado na tabela `clientes`, o webhook MUST cadastrar um novo cliente na tabela `clientes` configurando `usuario_id = NULL`, `telefone = 55419XXXXXXXX` e `nome` com o valor do perfil de contato da Meta.
*   **REQ-WHATS-022**: Com o ID do cliente determinado, o webhook MUST buscar se há alguma conversa ativa na tabela `conversas` associada a este cliente.
*   **REQ-WHATS-023**: Se não existir nenhuma conversa registrada para o cliente ou se a última conversa estiver marcada como `status = 'fechada'`, o webhook MUST criar uma nova conversa com `status = 'ia_atendendo'` e `ia_ativa = true`.
*   **REQ-WHATS-024**: A mensagem recebida do WhatsApp MUST ser inserida na tabela `mensagens` associada à conversa ativa encontrada ou criada, definindo `remetente = 'cliente'` e `whatsapp_mensagem_id` com o ID original fornecido pela Meta.

### 2.6 Mensagens de Saída (Outbound Messaging)
*   **REQ-WHATS-025**: O sistema MUST disponibilizar um serviço interno (Server Action ou classe auxiliar) capaz de disparar mensagens de saída usando a Meta Cloud API através do método `POST https://graph.facebook.com/v18.0/{phone_number_id}/messages` com o cabeçalho `Authorization: Bearer WHATSAPP_ACCESS_TOKEN`.
*   **REQ-WHATS-026**: O serviço de saída MUST salvar no banco de dados a mensagem enviada na tabela `mensagens` sob a conversa correspondente, definindo `whatsapp_mensagem_id` com o ID da mensagem retornado no JSON de sucesso da Meta.
*   **REQ-WHATS-027**: O remetente da mensagem salva MUST ser `'operador'` (se disparada de forma manual por um funcionário logado no CRM) ou `'ia'` (se disparada autonomamente pela IA Sofía).
*   **REQ-WHATS-028**: O sistema MUST usar mensagens do tipo `template` pré-aprovadas pela Meta se a última interação do cliente tiver ocorrido há mais de 24 horas (janela de atendimento fechada).
*   **REQ-WHATS-029**: O sistema MUST permitir mensagens de tipo livre (`text` ou arquivos de mídia) se o cliente enviou alguma mensagem nas últimas 24 horas (janela de atendimento aberta).

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Verificação bem-sucedida do Webhook (GET)
*   **Given** que o servidor de webhook do Asados está em execução.
*   **And** a variável de ambiente `WHATSAPP_VERIFY_TOKEN` está configurada como `meu_token_secreto_123`.
*   **When** a Meta faz uma requisição `GET` para `/api/webhooks/whatsapp` com os parâmetros `hub.mode = "subscribe"`, `hub.verify_token = "meu_token_secreto_123"` e `hub.challenge = "1158201444"`.
*   **Then** o sistema retorna o status HTTP `200 OK`.
*   **And** o corpo da resposta em formato texto contém exatamente `1158201444`.

### Cenário 2: Tentativa de verificação com token incorreto (GET)
*   **Given** que a variável de ambiente `WHATSAPP_VERIFY_TOKEN` está configurada como `meu_token_secreto_123`.
*   **When** a Meta faz uma requisição `GET` para `/api/webhooks/whatsapp` com os parâmetros `hub.mode = "subscribe"`, `hub.verify_token = "token_errado_999"` e `hub.challenge = "1158201444"`.
*   **Then** o sistema retorna o status HTTP `403 Forbidden`.
*   **And** o handshake de validação é rejeitado.

### Cenário 3: Recebimento e processamento de mensagem de texto de cliente existente
*   **Given** que o cliente com telefone `5541988887777` já está cadastrado no banco de dados e possui uma conversa ativa com status `'ia_atendendo'`.
*   **When** o webhook recebe uma requisição `POST` da Meta contendo uma mensagem de texto com `from = "5541988887777"`, `id = "wamid.HBgMNTU0MTk4ODg4Nzc3NxUCABEYQzEy"` e `text.body = "Gostaria de ver o cardápio"`.
*   **Then** o sistema valida a assinatura no cabeçalho `x-hub-signature-256`.
*   **And** verifica que o ID da mensagem não é duplicado.
*   **And** insere um novo registro na tabela `mensagens` associado à conversa ativa com `remetente = 'cliente'`, `conteudo = "Gostaria de ver o cardápio"` e `whatsapp_mensagem_id = "wamid.HBgMNTU0MTk4ODg4Nzc3NxUCABEYQzEy"`.
*   **And** retorna HTTP `200 OK`.

### Cenário 4: Recebimento de mensagem com auto-registro de cliente novo (Curitiba)
*   **Given** que o telefone `5541977776666` não existe cadastrado na tabela `clientes`.
*   **When** o webhook recebe uma requisição `POST` da Meta contendo uma mensagem de texto com `from = "5541977776666"`, `id = "wamid.HBgMNTU0MTk3Nzc3NjY2NhUCABEYQzEz"`, `contacts[0].profile.name = "Carlos Souza"` e `text.body = "Olá"`.
*   **Then** o sistema valida que o número atende à regex `^55419[0-9]{8}$`.
*   **And** cria um novo cliente na tabela `clientes` com `nome = "Carlos Souza"`, `telefone = "5541977776666"` e `usuario_id = NULL`.
*   **And** cria uma nova conversa na tabela `conversas` com `cliente_id` recém-gerado, `status = 'ia_atendendo'` e `ia_ativa = true`.
*   **And** insere la mensagem na tabela `mensagens` vinculada à nova conversa com `remetente = 'cliente'`, `conteudo = "Olá"` e `whatsapp_mensagem_id = "wamid.HBgMNTU0MTk3Nzc3NjY2NhUCABEYQzEz"`.

### Cenário 5: Rejeição de mensagem recebida de número fora de Curitiba (DDI/DDD inválidos)
*   **When** o webhook recebe uma requisição `POST` da Meta com `from = "5511999999999"` (DDD 11 - São Paulo) ou `from = "554133332222"` (Telefone Fixo).
*   **Then** o sistema valida o número e constata que não atende à expressão regular de Curitiba (`^55419[0-9]{8}$`).
*   **And** o sistema descarta o processamento da mensagem.
*   **And** não insere nenhum registro nas tabelas `clientes`, `conversas` ou `mensagens`.
*   **And** responde com HTTP `200 OK` (para que a Meta não repita o envio do webhook).

### Cenário 6: Prevenção de duplicidade de mensagens (Idempotência)
*   **Given** que uma mensagem com `whatsapp_mensagem_id = "wamid.HBgMNTU0MTk4ODg4Nzc3NxUCABEYQzEy"` já foi salva na tabela `mensagens`.
*   **When** o webhook recebe um reenvio (retry) da Meta com o mesmo payload e mesmo `id = "wamid.HBgMNTU0MTk4ODg4Nzc3NxUCABEYQzEy"`.
*   **Then** o sistema verifica a existência do `whatsapp_mensagem_id` no banco de dados.
*   **And** ignora a inserção no banco de dados.
*   **And** retorna HTTP `200 OK` imediatamente.

### Cenário 7: Recebimento de mensagem contendo anexo de imagem com ingestão automática
*   **Given** que o cliente `5541988887777` possui um chat ativo.
*   **When** o webhook recebe uma mensagem contendo uma imagem com `id = "wamid.HBgMNTU0MTk4ODg4Nzc3NxUCABEYQzE0"` e `image.id = "meta_media_id_999"`.
*   **Then** o sistema faz uma requisição para a Meta para obter os metadados de `meta_media_id_999`.
*   **And** obtém a URL temporária de download e efetua o download dos bytes da imagem.
*   **And** faz o upload do arquivo para o bucket privado `chat-midias` com o nome `{random-uuid}.png`.
*   **And** insere o registro na tabela `mensagens` salvando o caminho correspondente do Supabase Storage na coluna `url_anexo`.

### Cenário 8: Ignorar atualizações de status de mensagens da Meta
*   **When** o webhook recebe uma requisição `POST` da Meta contendo uma notificação de status de mensagem lida: `statuses[0].status = "read"`, `statuses[0].id = "wamid.HBgMNTU0MTk4ODg4Nzc3NxUCABEYQzEy"`.
*   **Then** o sistema intercepta o payload e detecta que trata-se de atualização de status e não de uma mensagem de entrada.
*   **And** o sistema não insere nenhum registro na tabela `mensagens`.
*   **And** opcionalmente registra o evento em logs de auditoria.
*   **And** responde com HTTP `200 OK`.

### Cenário 9: Envio de mensagem de texto simples de saída (Outbound) nas últimas 24h
*   **Given** que a última mensagem do cliente foi registrada há 2 horas (dentro da janela de 24 horas).
*   **When** o operador insere "O seu pedido já está a caminho!" no CRM e clica em enviar.
*   **Then** o serviço de mensagens outbound dispara um `POST` contendo um payload do tipo `text` com a mensagem para a API da Meta.
*   **And** a Meta retorna sucesso com o ID da mensagem.
*   **And** o sistema salva a mensagem no banco de dados na tabela `mensagens` com `remetente = 'operador'`, `conteudo = "O seu pedido já está a caminho!"`, `url_anexo = NULL` e `whatsapp_mensagem_id` preenchido com o ID retornado pela Meta.

### Cenário 10: Envio de mensagem de template de saída (Outbound) após 24h
*   **Given** que a última mensagem do cliente foi registrada há 28 horas (fora da janela de 24 horas).
*   **When** o operador escolhe disparar o template pré-aprovado de confirmação no painel CRM.
*   **Then** o serviço de mensagens outbound detecta o estouro da janela de 24 horas.
*   **And** dispara um `POST` contendo um payload do tipo `template` referenciando o modelo homologado (ex: `confirmacao_pedido`) e os parâmetros correspondentes para a API da Meta.
*   **And** após o retorno de sucesso da Meta, salva a mensagem no banco de dados com `remetente = 'operador'` e o ID da mensagem de confirmação retornado.

---

## Requirements added by `atendimento-global-sofia-status-control`

### Requirement: Global Sofia gate before channel processing

The WhatsApp webhook MUST check the channel-global Sofia state before any Sofia or RAG processing occurs.

When the channel is globally off, the webhook MUST not call Sofia, MUST not call RAG, and MUST not generate an LLM response.

When the channel is in yellow out-of-hours or business-hours paused state, the webhook MUST send only the configured schedule message and MUST not call the LLM.

#### Scenario: Global off blocks processing
- GIVEN WhatsApp Sofia is globally off
- WHEN an inbound WhatsApp message reaches the webhook
- THEN the webhook MUST skip Sofia and RAG processing
- AND no LLM call MUST be performed

#### Scenario: Yellow state sends only schedule message
- GIVEN WhatsApp Sofia is in the yellow out-of-hours state
- WHEN an inbound WhatsApp message reaches the webhook
- THEN the webhook MUST send only the configured schedule message
- AND the webhook MUST NOT call the LLM

### Requirement: Global priority over per-conversation awake state

The WhatsApp webhook MUST treat the channel-global Sofia state as higher priority than any per-client or per-conversation awake state.

A conversation that is awake MUST still be blocked when the global channel state is off.

#### Scenario: Awake conversation remains blocked globally
- GIVEN a conversation is awake for Sofia
- AND WhatsApp Sofia is globally off
- WHEN a message arrives for that conversation
- THEN the webhook MUST not invoke Sofia
- AND the awake state MUST NOT override the global off state
