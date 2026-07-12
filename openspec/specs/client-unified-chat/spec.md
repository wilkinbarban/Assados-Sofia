# Especificação de Requisitos: Histórico de Chat Unificado (client-unified-chat)

**ID da Mudança:** `cliente-chat-modulo`  
**Domínio:** `client-unified-chat`  
**Status:** `Pendente de Revisão`  

---

## 1. Descrição Executiva
Esta especificação descreve a consolidação do histórico de mensagens de múltiplos canais de comunicação (WhatsApp, Telegram e Web Chat) do cliente em uma única tela, com badges identificadores visuais claros e a habilidade da Sofía de responder interativamente no Web Chat.

---

## 2. Requisitos de Sistema (RFC 2119)
*   **REQ-UCHAT-001**: O sistema MUST exibir o histórico de mensagens consolidando os canais WhatsApp, Telegram e Web Chat.
*   **REQ-UCHAT-002**: Cada mensagem exibida no histórico MUST conter um badge identificador visual claro da sua origem (WhatsApp, Telegram ou Web).
*   **REQ-UCHAT-003**: A inteligência artificial Sofía MUST responder interativamente na interface web-chat sempre que `ia_ativa` for true na conversa do cliente.

---

## 3. Cenários de Aceitação (Gherkin)

### Cenário: Histórico unificado com identificação de canal
*   **Given** que o cliente está autenticado na interface web do chat.
*   **When** o histórico possui mensagens oriundas de WhatsApp, Telegram e Web Chat.
*   **Then** a interface renderiza as mensagens em ordem cronológica unificada.
*   **And** exibe o respectivo badge de canal (WhatsApp, Telegram, Web) para cada mensagem.

### Cenário: Resposta da Sofía no Web Chat
*   **Given** que o cliente possui uma conversa com `ia_ativa = true`.
*   **When** o cliente envia uma nova mensagem pelo Web Chat.
*   **Then** o sistema processa a mensagem via `processarIaChat`.
*   **And** exibe a resposta da Sofía integrada no histórico do Web Chat.
