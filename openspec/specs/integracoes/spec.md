# Especificação de Requisitos: Integrações (integracoes)

**ID da Mudança:** `epica10-melhorias-gerais`  
**Domínio:** `integracoes`  
**Status:** `Aprovado`  

---

## 1. Descrição Executiva

Este documento especifica os requisitos de negócio e técnicos para as integrações externas do CRM Asados, cobrindo o bot do Telegram para atendimento, a unificação de provedores de WhatsApp (Meta Cloud API e Evolution API), e correções de configuração de e-mail no console do Supabase Cloud.

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Integração de Bot do Telegram
*   **REQ-TEL-001**: O sistema MUST criar uma chave na tabela `public.configuracoes_sistema` com o nome `'TELEGRAM_BOT_TOKEN'` (com `eh_segredo = TRUE`) para armazenar com segurança o token de autenticação fornecido pelo BotFather.
*   **REQ-TEL-002**: A aba "Integrações" do `AdminDashboard` MUST conter um card denominado "Telegram Bot Card", que gerencie as configurações do robô de atendimento.
*   **REQ-TEL-003**: O "Telegram Bot Card" MUST conter um campo de input com máscara para o token, um botão para salvar a configuração e um botão "Testar Conexão".
*   **REQ-TEL-004**: O botão "Testar Conexão" MUST fazer uma chamada assíncrona para a API do Telegram (`https://api.telegram.org/bot<TOKEN>/getMe`) para validar se o token é válido e ativo no Telegram, exibindo o status de sucesso com o `@username` do bot ou a mensagem de erro retornada.
*   **REQ-TEL-005**: O banco de dados MUST ser modificado para suportar o cadastro de usuários originados do Telegram:
    *   A tabela `public.clientes` MUST receber a coluna `telegram_chat_id` VARCHAR(100) UNIQUE.
    *   A tabela `public.clientes` MUST ter a obrigatoriedade da coluna `telefone` relaxada (`DROP NOT NULL`), permitindo a inclusão de registros que possuam apenas `telegram_chat_id`.
    *   A restrição de validação `chk_telefone_curitiba` na tabela `public.clientes` MUST permanecer active, de forma que, sempre que um telefone for fornecido (não nulo), ele seja validado conforme a regra DDD 41 Curitiba.
*   **REQ-TEL-006**: A tabela `public.mensagens` MUST receber a coluna `telegram_mensagem_id` VARCHAR(100) UNIQUE para controle de idempotência de eventos inbound.
*   **REQ-TEL-007**: O sistema MUST expor a rota de webhook `/api/webhooks/telegram` do tipo `POST` para receber updates enviados pelo Telegram.
*   **REQ-TEL-008**: Ao receber um Update contendo uma mensagem de texto, o sistema MUST:
    1.  Verificar a idempotência através da coluna `telegram_mensagem_id`. Se a mensagem já existir no banco, descartar o processamento.
    2.  Procurar se existe um cliente cadastrado com o respectivo `telegram_chat_id`.
    3.  Caso não exista, criar automaticamente o cliente em `public.clientes`, mapeando o campo `nome` (usando o `first_name` + `last_name` ou o `username` do remetente do Telegram) e gravando seu `telegram_chat_id`, mantendo o `telefone` como `NULL`.
    4.  Localizar ou abrir uma conversa ativa (`status` = `'ia_atendendo'`) vinculada àquele cliente.
    5.  Registrar a mensagem do cliente na tabela `public.mensagens` associada à conversa.
*   **REQ-TEL-009**: Se a conversa recuperada/criada possuir a flag `ia_ativa` = `TRUE`, o pipeline de RAG Sofía MUST ser disparado automaticamente:
    1.  Pesquisar na base de conhecimento usando FTS com o texto da mensagem.
    2.  Invocar o modelo LLM passando a Persona "Sofía" e os artigos recuperados.
    3.  Inserir a resposta gerada em `public.mensagens` com `remetente` = `'ia'`.
    4.  Enviar assincronamente o texto da resposta para o chat correspondente no Telegram utilizando a API de envio (`https://api.telegram.org/bot<TOKEN>/sendMessage`).

### 2.2 Unificação dos Cards do WhatsApp (Meta & Evolution)
*   **REQ-WHA-001**: O sistema MUST remover os cards separados `MetaWhatsAppCard.tsx` e `EvolutionApiCard.tsx` e substituí-los por um único componente consolidado chamado `WhatsAppCard.tsx`.
*   **REQ-WHA-002**: O componente `WhatsAppCard.tsx` MUST conter um seletor visual (chave toggle ou switch) que determine o provedor de WhatsApp ativo no sistema: `META` ou `EVOLUTION`.
*   **REQ-WHA-003**: A seleção do provedor ativo MUST ser persistida na tabela `public.configuracoes_sistema` sob a chave `'PROVEDOR_WHATSAPP_ATIVO'`.
*   **REQ-WHA-004**: Ao selecionar `META`, o card MUST exibir exclusivamente e gerenciar os campos:
    *   `WHATSAPP_ACCESS_TOKEN` (eh_segredo = TRUE)
    *   `WHATSAPP_PHONE_NUMBER_ID`
    *   `WHATSAPP_VERIFY_TOKEN` (eh_segredo = TRUE)
    *   `WHATSAPP_APP_SECRET` (eh_segredo = TRUE)
*   **REQ-WHA-005**: Ao selecionar `EVOLUTION`, o card MUST exibir exclusivamente e gerenciar os campos:
    *   `EVOLUTION_API_URL`
    *   `EVOLUTION_API_KEY` (eh_segredo = TRUE)
    *   `EVOLUTION_INSTANCE_NAME`
*   **REQ-WHA-006**: O componente MUST desabilitar ou ocultar os campos do provedor inativo para evitar confusão do administrador sobre qual canal de comunicação está operando no momento.

### 2.3 Correções de Confirmação de E-mail no Supabase Cloud
*   **REQ-EML-001**: O projeto MUST registrar e documentar em suas especificações operacionais as seguintes configurações obrigatórias no console do Supabase Cloud para resolver o problema de e-mails em inglês e redirecionamentos incorretos para `localhost`:
    1.  **Tradução de Modelos de E-mail (Email Templates)**: No menu `Authentication -> Email Templates` do console Supabase Cloud, traduzir os campos de Assunto e Corpo das mensagens de confirmação de cadastro, recuperação de senha e alteração de e-mail para o idioma Português (pt-BR).
    2.  **Configuração da URL do Site (Site URL)**: No menu `Authentication -> URL Configuration` do console Supabase Cloud, alterar o campo "Site URL" de `http://localhost:3000` para a URL do domínio de produção configurada para o CRM (ex: `https://asados.seudominio.com.br`).
    3.  **Urls de Redirecionamento Adicionais (Redirect URLs)**: No mesmo menu, configurar em "Redirect URLs" as portas de desenvolvimento aceitáveis (ex: `http://localhost:3000/**`, `http://localhost:3001/**`) para que os fluxos de autenticação local continuem funcionando durante os testes de desenvolvimento.

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Validação e salvamento de token do bot do Telegram
*   **Given** que o administrador está na aba de Integrações e acessa o card "Telegram Bot".
*   **When** insere no campo de Token o valor inválido `'BOT_INVALID_TOKEN'` e clica em "Testar Conexão".
*   **Then** o sistema realiza uma chamada HTTP para a API do Telegram.
*   **And** exibe uma notificação visual de erro na tela informando "Falha ao conectar: Token inválido".
*   **When** insere o token válido `'123456:ABC-DEF1234ghIkl-zyx'` e clica em "Salvar Token".
*   **Then** o sistema grava o valor de `'123456:ABC-DEF1234ghIkl-zyx'` na tabela `public.configuracoes_sistema` com a chave `'TELEGRAM_BOT_TOKEN'`.
*   **And** exibe um status de sucesso contendo o nome configurado do robô (ex: `@SofiaAsadosBot`).

### Cenário 2: Inbound de mensagens via Telegram e resposta RAG
*   **Given** que o bot do Telegram possui o webhook cadastrado para o endereço `/api/webhooks/telegram`.
*   **When** um usuário do Telegram com ID `'CHAT_TELEGRAM_101'` envia a mensagem "Qual é o horário de atendimento?" no chat privado.
*   **Then** o endpoint `/api/webhooks/telegram` é acionado pelo servidor do Telegram.
*   **And** o sistema valida que a mensagem com ID `'msg_tg_001'` é única (idempotência).
*   **And** cria um registro de cliente em `public.clientes` associado a `telegram_chat_id = 'CHAT_TELEGRAM_101'` com telefone como `NULL`.
*   **And** gera uma conversa com `status = 'ia_atendendo'` e `ia_ativa = TRUE`.
*   **And** insere a mensagem do cliente na tabela `public.mensagens`.
*   **And** aciona o pipeline de RAG Sofía para recuperar informações de horários, gerar a resposta inteligente e enviá-la de volta via API do Telegram.

### Cenário 3: Alternância de provedores de WhatsApp no WhatsAppCard unificado
*   **Given** que o painel exibe o novo componente unificado `WhatsAppCard`.
*   **When** o administrador seleciona a opção `'EVOLUTION'` no seletor de provedores ativos.
*   **Then** os campos `Meta APP Secret` e `Phone Number ID` desaparecem ou ficam invisíveis.
*   **And** são apresentados apenas os campos `Evolution API URL`, `API Key` e `Instance Name`.
*   **When** o administrador preenche os campos da Evolution e clica em "Salvar Configuração".
*   **Then** as chaves correspondentes da Evolution são salvas em `public.configuracoes_sistema`.
*   **And** a chave `'PROVEDOR_WHATSAPP_ATIVO'` é definida como `'EVOLUTION'`.

---

## Requirements added by `atendimento-global-sofia-status-control`

### Requirement: Global channel Sofia settings

The system MUST persist and read two independent global Sofia settings, one for WhatsApp and one for Telegram.

Each setting MUST be available to the operator surface and to webhook processing.

#### Scenario: Persist independent channel settings
- GIVEN an administrator updates the Sofia availability for WhatsApp
- WHEN the setting is saved
- THEN the WhatsApp global state MUST be persisted independently of Telegram
- AND the Telegram state MUST remain unchanged

### Requirement: Telegram global Sofia gate

The Telegram webhook MUST check the Telegram global Sofia state before any Sofia or RAG processing occurs.

When Telegram is globally off, the webhook MUST not call Sofia, MUST not call RAG, and MUST not generate an LLM response, even if the conversation is awake.

#### Scenario: Telegram global off blocks processing
- GIVEN Telegram Sofia is globally off
- WHEN an inbound Telegram message reaches the webhook
- THEN the webhook MUST skip Sofia and RAG processing
- AND no LLM call MUST be performed

#### Scenario: Telegram awake conversation remains blocked globally
- GIVEN a Telegram conversation is awake for Sofia
- AND Telegram Sofia is globally off
- WHEN a message arrives for that conversation
- THEN the webhook MUST not invoke Sofia
- AND the awake state MUST NOT override the global off state

### Requirement: Provider-neutral LLM credit status

The system MUST expose a provider-neutral LLM credit status that returns the remaining USD value, freshness metadata, and availability state.

The credit status MUST be refreshable at least every 30 minutes and MUST support a stale or unknown state when the provider is unavailable.

#### Scenario: Refreshable credit status
- GIVEN the provider returns a current balance
- WHEN the status is requested
- THEN the system MUST return the remaining USD value
- AND the status MUST include freshness metadata no older than 30 minutes after refresh

#### Scenario: Unavailable provider
- GIVEN the credit provider cannot be queried
- WHEN the status is requested
- THEN the system MUST return a stale or unknown state
- AND it MUST NOT invent a current balance
