# Documento de Design Técnico: Melhorias Gerais (epica10-melhorias-gerais)

**ID da Mudança:** `epica10-melhorias-gerais`  
**Autor:** Antigravity (sdd-design subagent)  
**Status:** Em Revisão  
**Versão:** 1.0  

---

## 1. Arquitetura de Banco de Dados e Storage

Para suportar o upload de documentos de conhecimento (PDF/DOCX) e o cadastro de clientes integrados via Telegram, a estrutura do banco de dados será modificada conforme a migração `supabase/migrations/20260707000000_epica10_melhorias_gerais.sql`.

### 1.1 Modelo Físico de Dados (pt-BR)

```
                       +----------------------------------+
                       |      documentos_conhecimento     |
                       +----------------------------------+
                       | id (PK) UUID                     |
                       | nome_arquivo VARCHAR(255)        |
                       | tamanho_bytes BIGINT             |
                       | tipo_mime VARCHAR(100)           |
                       | caminho_storage TEXT             |
                       | data_criacao TIMESTAMPTZ         |
                       | data_atualizacao TIMESTAMPTZ     |
                       +----------------------------------+
                                        | (1)
                                        |
                                        | (N) [ON DELETE CASCADE]
                       +----------------------------------+
                       |         base_conhecimento        |
                       +----------------------------------+
                       | id (PK) UUID                     |
                       | titulo VARCHAR(255)              |
                       | conteudo TEXT                    |
                       | ativo BOOLEAN                    |
                       | documento_id (FK) UUID           | <-- Nova Coluna
                       +----------------------------------+
```

### 1.2 Alterações nas Tabelas Existentes

1. **`public.clientes`**:
   - Relaxar obrigatoriedade da coluna `telefone` (`DROP NOT NULL`) para permitir cadastro apenas com `telegram_chat_id`.
   - Adicionar coluna `telegram_chat_id` `VARCHAR(100) UNIQUE`.
   - Manter a validação `chk_telefone_curitiba` (`CHECK (telefone ~ '^55419[0-9]{8}$')`). Como os valores nulos não violam restrições `CHECK`, ela se aplicará apenas aos telefones fornecidos.

2. **`public.mensagens`**:
   - Adicionar coluna `telegram_mensagem_id` `VARCHAR(100) UNIQUE` para controle de idempotência.

3. **`public.base_conhecimento`**:
   - Adicionar coluna `documento_id` `UUID REFERENCES public.documentos_conhecimento(id) ON DELETE CASCADE`.

### 1.3 Supabase Storage Bucket

Será criado o bucket privado `'documentos-conhecimento'` com limite de tamanho de 10MB (`10.485.760 bytes`) e tipos MIME restritos a PDF e DOCX.

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documentos-conhecimento', 
    'documentos-conhecimento', 
    false,
    10485760,
    ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;
```

### 1.4 Políticas RLS e Grants

#### Tabela `public.documentos_conhecimento`
- **Habilitação**: `ALTER TABLE public.documentos_conhecimento ENABLE ROW LEVEL SECURITY;`
- **Acesso**: Permitir operações de `ALL` apenas para operadores autenticados com funções `admin`, `supervisor` ou `vendedor`.
- **Implementação**:
  ```sql
  CREATE POLICY "Operadores possuem acesso completo aos documentos" 
  ON public.documentos_conhecimento
  FOR ALL TO authenticated
  USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]))
  WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));
  ```

#### Storage Bucket Policies
- **Upload / Leitura / Exclusão**: Restritos a operadores autenticados via `public.tem_funcoes(...)`.

---

## 2. Integração com Telegram e Roteamento de Webhooks

A arquitetura do webhook e envio de mensagens para o Telegram é estruturada para responder rapidamente aos updates (inbound) e despachar via API oficial de bots de forma assíncrona (outbound).

### 2.1 Fluxo de Webhook Inbound e Resposta RAG

```
[Cliente Telegram] 
        | (Envia Mensagem)
        v
[Telegram API] 
        | (POST Webhook)
        v
[Next.js Webhook: /api/webhooks/telegram]
        |
        +---> 1. Valida Idempotência (telegram_mensagem_id)
        |
        +---> 2. Obtém/Cria Cliente em public.clientes (telefone = NULL)
        |
        +---> 3. Obtém/Cria Conversa Ativa (status = 'ia_atendendo')
        |
        +---> 4. Insere Mensagem do Cliente na tabela mensagens
        |
        +---> 5. Se ia_ativa == true, dispara processarRagPipeline()
                        |
                        v
        [Pipeline RAG Sofía (openrouter.ts)]
                |
                +---> a. Consulta Base de Conhecimento (FTS)
                +---> b. Obtém Prompt Mestre de configuracoes_sistema
                +---> c. Envia ao OpenRouter/DeepSeek
                +---> d. Insere resposta no BD (remetente = 'ia')
                +---> e. Dispara enviarMensagemTelegram()
                                |
                                v
                      [Telegram Bot API] ---> [Cliente Telegram]
```

### 2.2 Utilitário de Envio (`src/lib/telegram/send.ts`)

Conterá o método `enviarMensagemTelegram(conversaId, payload)` para despachar mensagens de texto ou mídia. 

- **Assinatura**:
  ```typescript
  export async function enviarMensagemTelegram(
    conversaId: string,
    payload: EnviarMensagemPayload
  ): Promise<ResultadoEnvio>
  ```
- **Lógica**:
  1. Carrega `'TELEGRAM_BOT_TOKEN'` via `obterConfiguracaoSistema`.
  2. Recupera o `telegram_chat_id` do cliente vinculado à conversa.
  3. Se `payload.anexoPath` estiver presente, gera URL assinada no Supabase Storage e chama `sendDocument`.
  4. Caso contrário, envia texto comum usando `sendMessage`.
  5. Insere a mensagem gerada na tabela `public.mensagens` preenchendo o `telegram_mensagem_id` correspondente.

### 2.3 Server Action de Teste (`admin.ts`)

`testarConexaoTelegram(token)` valida o token fornecido com a API do Telegram utilizando a rota `/getMe`.
Retorna `{ success: true, username }` ou `{ success: false, error }`.

---

## 3. Unificação dos Cards de WhatsApp

Os componentes separados `MetaWhatsAppCard.tsx` e `EvolutionApiCard.tsx` serão deletados. Em seu lugar, será criado o componente unificado `WhatsAppCard.tsx`.

### 3.1 Interface do Usuário

O card unificado apresentará:
- Um **Switcher Visual (Toggle)** que escolhe o provedor de WhatsApp ativo (`META` ou `EVOLUTION`). A alteração persiste imediatamente no banco sob a chave `'PROVEDOR_WHATSAPP_ATIVO'`.
- Duas seções bem delineadas:
  1. **Configurações Meta Cloud API**: Inputs para `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
  2. **Configurações Evolution API**: Inputs para `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME` e botão para obter o QR Code de conexão.
- **Grayscale Overlay**: A seção referente ao provedor inativo receberá a classe Tailwind `opacity-40 pointer-events-none filter grayscale transition-all duration-300`, garantindo clareza visual completa sobre qual canal está em uso.

### 3.2 Sincronização e Fallback de Leitura

O utilitário `obterProvedorAtivo` em `src/lib/whatsapp/provider.ts` será atualizado para ler prioritariamente a chave `'PROVEDOR_WHATSAPP_ATIVO'`, tolerando valores em caixa alta/baixa (`meta`/`META`, `evolution`/`EVOLUTION`), e mantendo fallback para `'WHATSAPP_PROVIDER'` para assegurar retrocompatibilidade absoluta.

---

## 4. Módulo de Perfil do Operador

Criar a página `/src/app/atendimento/perfil/page.tsx` para permitir que operadores ativos gerenciem seus próprios dados.

### 4.1 Server Actions (`admin.ts` ou `perfil.ts`)

1. **`atualizarPerfilProprio(nome: string)`**:
   - Valida se o usuário logado possui a função autorizada (`admin`, `supervisor`, `vendedor`).
   - Atualiza a coluna `nome` na tabela `public.perfis` para o `id = auth.uid()`.
   - Registra log de auditoria com a ação `'atualizar_perfil'` contendo apenas `{ nome_atualizado: true }` no campo `detalhes` (preservando LGPD/PII).

2. **`atualizarSenhaPropria(senha: string)`**:
   - Invoca `supabase.auth.updateUser({ password: senha })` no servidor.
   - Registra log de auditoria correspondente com a ação `'atualizar_perfil'` contendo `{ senha_alterada: true }`.

### 4.2 Integração de Links e Navegação

- **Cabeçalho Principal (`src/app/atendimento/page.tsx`)**: Adicionar um botão discreto de "Meu Perfil" redirecionando para `/atendimento/perfil`.
- **Sidebar Admin (`AdminDashboard.tsx`)**: Inserir link de navegação para a página de perfil acima do botão "Sair".

---

## 5. Extração Server-Side de Texto RAG (PDF/DOCX)

Implementação do upload e processamento direto no servidor para expansão automatizada da base de conhecimento RAG.

```
[Arquivo PDF/DOCX] ---> [Front-end: Valida tamanho < 10MB]
                                 |
                                 v
             [Server Action: importarDocumentoConhecimento]
                                 |
                                 +---> 1. Valida quantidade de documentos <= 50
                                 +---> 2. Salva arquivo binário no Supabase Storage
                                 +---> 3. Registra em public.documentos_conhecimento
                                 +---> 4. Extração de texto raw no servidor:
                                 |         ├── PDF: pdf-parse
                                 |         └── DOCX: mammoth
                                 |
                                 +---> 5. Chunking: divide o texto em blocos de <= 4000 caracteres
                                 +---> 6. Salva chunks em public.base_conhecimento
                                           (vinculados via documento_id)
```

### 5.1 Nova Ação: `importarDocumentoConhecimento`

Localizada em `src/app/actions/conhecimento.ts`:
- **Parâmetros**: `base64Data: string`, `filename: string`, `sizeBytes: number`, `mimeType: string`
- **Validações**:
  - Verifica limite máximo de 10MB.
  - Verifica MIME Type (`application/pdf` ou `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
  - Bloqueia arquivos legados `.doc` com retorno informativo explicitando o overhead de dependências binárias nativas em ambiente Docker.
  - Conta total de linhas na tabela `public.documentos_conhecimento`. Rejeita se total >= 50.
- **Segmentação (Chunking)**:
  - O texto extraído é dividido semanticamente (por parágrafos) ou mecanicamente respeitando o limite rígido de 4.000 caracteres.
  - Cada fragmento é persistido em `public.base_conhecimento` com `titulo = "${filename} - Parte ${index + 1}"` e `documento_id` associado.

---

## 6. Editor de Prompt Mestre do Sistema

Transição definitiva das regras da persona "Sofía" de instruções estáticas para configurações do banco de dados editáveis em tempo real.

### 6.1 RAG Pipeline (`src/lib/ai/openrouter.ts`)

Substituir o prompt padrão hardcoded pelo valor configurado:
```typescript
const basePrompt = (await obterConfiguracaoSistema('SOFIA_SYSTEM_PROMPT')) || systemPromptStatic;
```
O pipeline continuará injetando o `CONTEXTO DE SUPORTE` e o `HISTÓRICO DA CONVERSA` ao final do prompt de sistema carregado dinamicamente.

### 6.2 Editor no Dashboard Admin

Na aba "Prompt da IA" em `AdminDashboard.tsx`:
- Substituir a visualização estática por um campo `<textarea>` editável inicializado com `systemConfigs?.SOFIA_SYSTEM_PROMPT || systemPromptStatic`.
- Adicionar o botão "Salvar Prompt" que invoca `salvarConfiguracaoAdmin('SOFIA_SYSTEM_PROMPT', systemPrompt)`.
- Registrar log de auditoria com a ação `'atualizar_prompt_sistema'` e ID do operador logado.

---

## 7. Estratégia de Configuração de E-mail Supabase Cloud

Documentação das configurações obrigatórias a serem feitas no console do Supabase Cloud (`Authentication`):
1. **Templates de E-mail**: Tradução completa dos assuntos e corpos de mensagem em `Authentication -> Email Templates` para Português (pt-BR).
2. **Site URL**: Definição da URL principal de produção (ex: `https://asados.seudominio.com.br`) em `Authentication -> URL Configuration`.
3. **Redirect URLs**: Configuração de padrões de wildcard local (ex: `http://localhost:3000/**`, `http://localhost:3001/**`) para testes no fluxo de cadastro e login de desenvolvimento.

---

## 8. Grade Responsiva no Painel de Integrações

Modificação da estrutura CSS no contêiner da aba de Integrações no `AdminDashboard.tsx`:
```tsx
{/* De flex flex-col para grid responsivo */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl pb-10">
  <LlmApiCard ... />
  <WhatsAppCard ... />
  <TelegramBotCard ... />
  <GoogleCalendarCard ... />
  <MercadoPagoCard ... />
</div>
```
Garante empilhamento automático em dispositivos móveis e distribuição em duas colunas em telas de desktop.
