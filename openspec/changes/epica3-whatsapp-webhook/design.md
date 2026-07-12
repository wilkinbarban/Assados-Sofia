# Desenho Técnico: Webhook do WhatsApp e Mensagens de Saída (Épica 3)

**ID da Mudança:** `epica3-whatsapp-webhook`  
**Status:** `Pendente de Revisão`

---

## 1. Estratégia Técnica

A integração com a Meta Cloud API será realizada de forma nativa e segura através de rotas de API no Next.js 16 (App Router) e utilitários auxiliares executados no servidor, garantindo a conformidade com as regras de validação regionais (Curitiba DDD 41) e o controle estrito de concorrência e idempotência.

```text
+----------+  Webhook Event   +------------------+  Verify & Process  +--------------+
|   Meta   | ===============> |   Next.js API    | ==================> | Supabase DB  |
|  Cloud   |                  | /api/webhooks/wa |                     | (Admin Client|
+----------+                  +------------------+                     +--------------+
                                       ||
                            Download   || Upload
                            Media      \/
                              +------------------+
                              | Supabase Storage |
                              |  (chat-midias)   |
                              +------------------+
```

---

## 2. Banco de Dados e Migrações

Criação da migração `supabase/migrations/20260704150000_epica3_whatsapp_webhook.sql` para adicionar a coluna de idempotência à tabela `mensagens`.

```sql
-- Adiciona a coluna para armazenar o ID único da mensagem da Meta
ALTER TABLE public.mensagens 
ADD COLUMN whatsapp_mensagem_id VARCHAR(100) UNIQUE;

COMMENT ON COLUMN public.mensagens.whatsapp_mensagem_id IS 'ID único da mensagem retornado pela Meta para evitar duplicidade.';
```

---

## 3. Handlers de API (Next.js API Route)

**Caminho:** `src/app/api/webhooks/whatsapp/route.ts`

### 3.1 GET: Validação de Handshake (Meta Verification)
* **Parâmetros da Query**: `hub.mode`, `hub.verify_token`, `hub.challenge`.
* **Fluxo**:
  1. Validar se `hub.mode === 'subscribe'`.
  2. Verificar se `hub.verify_token` coincide com a variável de ambiente `WHATSAPP_VERIFY_TOKEN`.
  3. Retornar `hub.challenge` como resposta em formato `text/plain` com status `200 OK`. Em caso de erro, retornar `403 Forbidden`.

### 3.2 POST: Processamento de Eventos (Inbound Messages)
* **Fluxo de Execução**:

```text
[POST Request] -> Validate HMAC-SHA256 Signature -> Check Duplicity (Idempotency) 
      |
      +-> Filter Status Notifications (Ignore & Return 200 OK)
      |
      +-> Validate Phone (Curitiba Regex ^55419[0-9]{8}$) -> If invalid, Discard Cleanly
      |
      +-> Auto-Register Client (If not exists, create with usuario_id = NULL)
      |
      +-> Find/Create Active Conversation (status = 'ia_atendendo', ia_ativa = true)
      |
      +-> Download Media (If Image/Audio/Doc) -> Upload to Storage -> Get url_anexo
      |
      +-> Insert Message in DB -> Return 200 OK
```

* **Validação de Assinatura (Segurança)**:
  Obter `x-hub-signature-256`, calcular o HMAC-SHA256 do corpo bruto utilizando `WHATSAPP_APP_SECRET` e comparar os hashes de forma segura (`crypto.timingSafeEqual`) para evitar ataques de temporização.

* **Idempotência**:
  Antes de processar qualquer mensagem, verificar se `whatsapp_mensagem_id` já existe na tabela `public.mensagens`. Se sim, ignorar e retornar `200 OK` imediatamente.

* **Ingestão de Mídias (Media Ingest)**:
  1. Se a mensagem contiver anexo (`image`, `audio`, `document`), consultar `GET https://graph.facebook.com/v18.0/{media_id}` com `Authorization: Bearer WHATSAPP_ACCESS_TOKEN` para obter a URL temporária de download.
  2. Efetuar download do arquivo.
  3. Fazer upload para o bucket privado `chat-midias` com o nome `{uuid}.{extensao}` usando o cliente de administração (`createAdminClient`).
  4. Salvar o caminho relativo no banco na coluna `mensagens.url_anexo`.

---

## 4. Utilitário Outbound (WhatsApp Send Utility)

**Caminho:** `src/lib/whatsapp/send.ts`

### 4.1 Função `enviarMensagemWhatsapp`

```typescript
export async function enviarMensagemWhatsapp(
  conversaId: string, 
  payload: { 
    texto?: string; 
    anexoPath?: string; 
    templateName?: string; 
    templateParams?: any[];
    remetente?: 'operador' | 'ia';
  }
)
```

### 4.2 Regra de Negócio: Janela de Conversação de 24 Horas
1. Obter o cliente associado à conversa através da tabela `conversas`.
2. Buscar na tabela `mensagens` a última mensagem enviada pelo cliente (`remetente = 'cliente'`).
3. Calcular a diferença de tempo:
   * **Janela Fechada (> 24h)**: Exigir obrigatoriamente a passagem de um `templateName` válido. Disparar a chamada para a Meta no formato de `template`. Lançar erro se apenas texto livre for fornecido.
   * **Janela Aberta (<= 24h)**: Permitir o envio de texto livre (`texto`) ou mídias. Se houver `anexoPath` (caminho privado no Supabase Storage), gerar uma URL assinada temporária (ex: válida por 1 hora) para que a Meta possa baixar o arquivo e enviá-lo ao destinatário.
4. Após o envio bem-sucedido, inserir a mensagem na tabela `mensagens` via `createAdminClient` registrando o `whatsapp_mensagem_id` retornado pela API da Meta.

---

## 5. Variáveis de Ambiente e Segurança

| Variável | Escopo | Descrição |
| :--- | :--- | :--- |
| `WHATSAPP_VERIFY_TOKEN` | Servidor | Token secreto para handshake do GET do webhook. |
| `WHATSAPP_APP_SECRET` | Servidor | Segredo do aplicativo da Meta para validação HMAC da assinatura. |
| `WHATSAPP_ACCESS_TOKEN` | Servidor | Token de acesso de longa duração da API do WhatsApp. |
| `WHATSAPP_PHONE_NUMBER_ID` | Servidor | ID do número de telefone oficial configurado na Meta. |

---

## 6. Estratégia de Testes

1. **Testes Unitários**: Validar a lógica de verificação de assinatura HMAC e validação do formato de telefone Curitiba regex com casos de teste válidos e inválidos.
2. **Testes de Integração**: Testar o endpoint do webhook simulando payloads de texto, imagens e notificações de status (utilizando mocks da Meta API localmente para evitar custos e chamadas externas).
3. **Validação da Janela de 24h**: Criar cenários simulando mensagens enviadas pelo cliente a mais de 24 horas para garantir que o sistema rejeita texto livre e exige o uso correto de templates homologados.
