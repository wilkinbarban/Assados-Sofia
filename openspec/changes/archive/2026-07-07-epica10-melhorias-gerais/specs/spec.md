# Especificação de Requisitos: Melhorias Gerais (epica10-melhorias-gerais)

**ID da Mudança:** `epica10-melhorias-gerais`  
**Domínio:** `dashboard_admin`, `rag_conhecimento`, `perfil_operador`, `integracoes`  
**Status:** `Aguardando Revisão`  

---

## 1. Descrição Executiva

Este documento especifica a implementação de melhorias consolidadas no sistema CRM e RAG Sofía (Asados), divididas em sete frentes principais:
1. **Responsividade do Painel de Integrações:** Melhoria do layout em grade de duas colunas em telas grandes.
2. **Integração com Bot do Telegram:** Suporte nativo a atendimento automatizado com RAG via Telegram, incluindo gerenciamento de tokens e conexão.
3. **Unificação dos Cards do WhatsApp:** Fusão dos cards Meta e Evolution em um único componente coeso.
4. **Módulo de Perfil dos Operadores:** Rota segura `/atendimento/perfil` para operadores alterarem nome e senha.
5. **Upload de Documentos RAG:** Suporte a arquivos PDF/DOCX com parser server-side e fragmentação automática para a base de conhecimento.
6. **Editor de Prompt do Sistema Mestre:** Edição em tempo real do prompt da persona "Sofía" a partir do painel administrativo.
7. **Guia de Ajustes de Confirmação de E-mail:** Passos para configurar o Supabase Cloud mitigando templates em inglês e problemas de redirecionamento localhost.

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Grade Responsiva no Dashboard de Integrações
*   **REQ-DSH-001**: O contêiner de exibição de cards na aba "Integrações" do painel `AdminDashboard` MUST ser alterado para renderizar em formato de grade responsiva.
*   **REQ-DSH-002**: Em resoluções móveis e tablets (telas pequenas e médias), a grade MUST exibir os cards em uma única coluna (`grid-cols-1`).
*   **REQ-DSH-003**: Em resoluções grandes (desktops e notebooks), a grade MUST exibir os cards em duas colunas (`lg:grid-cols-2`).
*   **REQ-DSH-004**: O espaçamento entre os cards na grade MUST utilizar a classe de utilidade de espaçamento padrão (`gap-6`).

### 2.2 Integração de Bot do Telegram
*   **REQ-TEL-001**: O sistema MUST criar uma chave na tabela `public.configuracoes_sistema` com o nome `'TELEGRAM_BOT_TOKEN'` (com `eh_segredo = TRUE`) para armazenar com segurança o token de autenticação fornecido pelo BotFather.
*   **REQ-TEL-002**: A aba "Integrações" do `AdminDashboard` MUST conter um card denominado "Telegram Bot Card", que gerencie as configurações do robô de atendimento.
*   **REQ-TEL-003**: O "Telegram Bot Card" MUST conter um campo de input com máscara para o token, um botão para salvar a configuração e um botão "Testar Conexão".
*   **REQ-TEL-004**: O botão "Testar Conexão" MUST fazer uma chamada assíncrona para a API do Telegram (`https://api.telegram.org/bot<TOKEN>/getMe`) para validar se o token é válido e ativo no Telegram, exibindo o status de sucesso com o `@username` do bot ou a mensagem de erro retornada.
*   **REQ-TEL-005**: O banco de dados MUST ser modificado para suportar o cadastro de usuários originados do Telegram:
    *   A tabela `public.clientes` MUST receber a coluna `telegram_chat_id` VARCHAR(100) UNIQUE.
    *   A tabela `public.clientes` MUST ter a obrigatoriedade da coluna `telefone` relaxada (`DROP NOT NULL`), permitindo a inclusão de registros que possuam apenas `telegram_chat_id`.
    *   A restrição de validação `chk_telefone_curitiba` na tabela `public.clientes` MUST permanecer ativa, de forma que, sempre que um telefone for fornecido (não nulo), ele seja validado conforme a regra DDD 41 Curitiba.
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

### 2.3 Unificação dos Cards do WhatsApp (Meta & Evolution)
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

### 2.4 Módulo de Perfil do Operador
*   **REQ-PRF-001**: O sistema MUST criar a página gerencial `/atendimento/perfil` dedicada aos perfis dos operadores.
*   **REQ-PRF-002**: O acesso à rota `/atendimento/perfil` MUST ser restrito a usuários autenticados cujos perfis na tabela `public.perfis` contenham as funções (`funcao`) `'admin'`, `'supervisor'` ou `'vendedor'`.
*   **REQ-PRF-003**: A página de perfil MUST permitir que o operador atualize o seu Nome completo. Ao salvar, o sistema MUST atualizar o valor na coluna `nome` da tabela `public.perfis` correspondente ao `id` (`auth.uid()`) do operador logado.
*   **REQ-PRF-004**: A página de perfil MUST permitir que o operador redefina sua senha de acesso ao sistema. O processo MUST invocar a API de redefinição de dados de login do Supabase Auth no servidor.
*   **REQ-PRF-005**: Qualquer ação de atualização de perfil ou alteração de senha executada pelo operador MUST registrar um log de auditoria na tabela `public.logs_auditoria` com a ação `'atualizar_perfil'` e os detalhes associados, excluindo a exibição de dados pessoais sensíveis ou senhas.

### 2.5 Base de Conhecimento e Processamento de Documentos RAG (PDF/DOCX)
*   **REQ-RAG-DOC-001**: O sistema MUST criar a tabela `public.documentos_base_conhecimento` para cadastrar os arquivos físicos associados à base de conhecimento:
    *   `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
    *   `nome_arquivo` VARCHAR(255) NOT NULL
    *   `tamanho_bytes` BIGINT NOT NULL
    *   `tipo_mime` VARCHAR(100) NOT NULL
    *   `caminho_storage` TEXT NOT NULL (caminho no bucket do storage)
    *   `data_criacao` TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    *   `data_atualizacao` TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
*   **REQ-RAG-DOC-002**: O sistema MUST criar um trigger de alteração de timestamp de modificação na tabela `public.documentos_base_conhecimento`.
*   **REQ-RAG-DOC-003**: A tabela `public.base_conhecimento` MUST receber a coluna `documento_id` UUID que referencia `public.documentos_base_conhecimento(id)` com a política de integridade referencial `ON DELETE CASCADE`.
*   **REQ-RAG-DOC-004**: O painel de controle da Base de Conhecimento MUST incluir uma seção para upload de arquivos em PDF e DOCX.
*   **REQ-RAG-DOC-005**: O limite máximo de tamanho por arquivo carregado MUST ser de 10MB (`10.485.760 bytes`).
*   **REQ-RAG-DOC-006**: O limite máximo de registros ativos na tabela `public.documentos_base_conhecimento` MUST ser de 50. Carregamentos que excedam esse número total MUST ser recusados no backend com erro de limite.
*   **REQ-RAG-DOC-007**: Os arquivos carregados MUST ser armazenados em um bucket privado do Supabase Storage chamado `'documentos-conhecimento'`.
*   **REQ-RAG-DOC-008**: Após o upload do arquivo para o bucket, o backend do sistema MUST realizar a extração textual automática do conteúdo do documento PDF ou DOCX utilizando bibliotecas do lado do servidor (ex: `pdf-parse` e `mammoth` ou similares).
*   **REQ-RAG-DOC-009**: O texto resultante da extração MUST ser segmentado semânticamente em blocos (chunks) de texto de até 4000 caracteres.
*   **REQ-RAG-DOC-010**: Cada bloco de texto gerado a partir do documento MUST ser salvo automaticamente como um novo registro na tabela `public.base_conhecimento`, com:
    *   `titulo`: Nome do arquivo concatenado com a indicação da respectiva parte (ex: "manual_churrascaria.pdf - Parte 1").
    *   `conteudo`: O texto do bloco segmentado.
    *   `documento_id`: Referência ao `id` do documento gerador.
    *   `ativo`: `TRUE` por padrão.
*   **REQ-RAG-DOC-011**: Ao excluir um documento na tabela `public.documentos_base_conhecimento`, os registros de base de conhecimento vinculados a ele MUST ser apagados em cascata, e o arquivo correspondente no bucket do Supabase Storage MUST ser removido fisicamente.

### 2.6 Editor de Prompt do Sistema Mestre
*   **REQ-PRM-001**: O sistema de RAG Sofía MUST parar de carregar a Persona da IA e as instruções operacionais de arquivos estáticos ou variáveis de ambiente locais.
*   **REQ-PRM-002**: O pipeline de RAG MUST carregar o system prompt a ser enviado na requisição do OpenRouter a partir do valor registrado na tabela `public.configuracoes_sistema` sob a chave `'SOFIA_SYSTEM_PROMPT'`.
*   **REQ-PRM-003**: A aba "Prompt da IA" do painel `AdminDashboard` MUST exibir um editor de texto interativo (textarea) com a carga inicial de `'SOFIA_SYSTEM_PROMPT'`.
*   **REQ-PRM-004**: Ao clicar em "Salvar", o sistema MUST realizar uma operação de `upsert` na tabela `public.configuracoes_sistema` gravando o novo texto sob a chave `'SOFIA_SYSTEM_PROMPT'` com `eh_segredo = FALSE`.
*   **REQ-PRM-005**: A ação de salvar o Prompt do Sistema mestre MUST disparar a inclusão de um log de auditoria na tabela `public.logs_auditoria` identificando a ação `'atualizar_prompt_sistema'` e registrando o ID do operador.

### 2.7 Correções de Confirmação de E-mail no Supabase Cloud
*   **REQ-EML-001**: O projeto MUST registrar e documentar em suas especificações operacionais as seguintes configurações obrigatórias no console do Supabase Cloud para resolver o problema de e-mails em inglês e redirecionamentos incorretos para `localhost`:
    1.  **Tradução de Modelos de E-mail (Email Templates)**: No menu `Authentication -> Email Templates` do console Supabase Cloud, traduzir os campos de Assunto e Corpo das mensagens de confirmação de cadastro, recuperação de senha e alteração de e-mail para o idioma Português (pt-BR).
    2.  **Configuração da URL do Site (Site URL)**: No menu `Authentication -> URL Configuration` do console Supabase Cloud, alterar o campo "Site URL" de `http://localhost:3000` para a URL do domínio de produção configurada para o CRM (ex: `https://asados.seudominio.com.br`).
    3.  **Urls de Redirecionamento Adicionais (Redirect URLs)**: No mesmo menu, configurar em "Redirect URLs" as portas de desenvolvimento aceitáveis (ex: `http://localhost:3000/**`, `http://localhost:3001/**`) para que os fluxos de autenticação local continuem funcionando durante os testes de desenvolvimento.

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Layout responsivo do painel de integrações
*   **Given** que o operador está autenticado como administrador no sistema Asados.
*   **And** acessa a aba "Integrações" do painel `/atendimento/dashboard`.
*   **When** a página é renderizada em uma tela com largura maior ou igual a 1024px.
*   **Then** o sistema exibe os cards em uma grade estruturada em exatamente duas colunas (`lg:grid-cols-2`).
*   **When** a tela é redimensionada para uma largura menor que 1024px.
*   **Then** a grade se ajusta de forma dinâmica, empilhando todos os cards verticalmente em uma única coluna (`grid-cols-1`).

### Cenário 2: Validação e salvamento de token do bot do Telegram
*   **Given** que o administrador está na aba de Integrações e acessa o card "Telegram Bot".
*   **When** insere no campo de Token o valor inválido `'BOT_INVALID_TOKEN'` e clica em "Testar Conexão".
*   **Then** o sistema realiza uma chamada HTTP para a API do Telegram.
*   **And** exibe uma notificação visual de erro na tela informando "Falha ao conectar: Token inválido".
*   **When** insere o token válido `'123456:ABC-DEF1234ghIkl-zyx'` e clica em "Salvar Token".
*   **Then** o sistema grava o valor de `'123456:ABC-DEF1234ghIkl-zyx'` na tabela `public.configuracoes_sistema` com a chave `'TELEGRAM_BOT_TOKEN'`.
*   **And** exibe um status de sucesso contendo o nome configurado do robô (ex: `@SofiaAsadosBot`).

### Cenário 3: Inbound de mensagens via Telegram e resposta RAG
*   **Given** que o bot do Telegram possui o webhook cadastrado para o endereço `/api/webhooks/telegram`.
*   **When** um usuário do Telegram com ID `'CHAT_TELEGRAM_101'` envia a mensagem "Qual é o horário de atendimento?" no chat privado.
*   **Then** o endpoint `/api/webhooks/telegram` é acionado pelo servidor do Telegram.
*   **And** o sistema valida que a mensagem com ID `'msg_tg_001'` é única (idempotência).
*   **And** cria um registro de cliente em `public.clientes` associado a `telegram_chat_id = 'CHAT_TELEGRAM_101'` com telefone como `NULL`.
*   **And** gera uma conversa com `status = 'ia_atendendo'` e `ia_ativa = TRUE`.
*   **And** insere a mensagem do cliente na tabela `public.mensagens`.
*   **And** aciona o pipeline de RAG Sofía para recuperar informações de horários, gerar a resposta inteligente e enviá-la de volta via API do Telegram.

### Cenário 4: Alternância de provedores de WhatsApp no WhatsAppCard unificado
*   **Given** que o painel exibe o novo componente unificado `WhatsAppCard`.
*   **When** o administrador seleciona a opção `'EVOLUTION'` no seletor de provedores ativos.
*   **Then** os campos `Meta APP Secret` e `Phone Number ID` desaparecem ou ficam invisíveis.
*   **And** são apresentados apenas os campos `Evolution API URL`, `API Key` e `Instance Name`.
*   **When** o administrador preenche os campos da Evolution e clica em "Salvar Configuração".
*   **Then** as chaves correspondentes da Evolution são salvas em `public.configuracoes_sistema`.
*   **And** a chave `'PROVEDOR_WHATSAPP_ATIVO'` é definida como `'EVOLUTION'`.

### Cenário 5: Atualização de perfil e redefinição de senha do operador
*   **Given** que um operador vendedor chamado "Maurício" está conectado no sistema.
*   **And** navega até o endereço `/atendimento/perfil`.
*   **When** altera o seu nome no formulário para "Maurício de Souza" e clica em "Salvar Alterações".
*   **Then** o sistema executa a atualização no banco na tabela `public.perfis` e exibe feedback de sucesso.
*   **When** digita sua nova senha de acesso e clica em "Atualizar Senha".
*   **Then** o sistema executa o método de alteração de senha no Supabase Auth e exibe confirmação.
*   **And** adiciona um log de auditoria registrando a atividade `'atualizar_perfil'` para o operador.

### Cenário 6: Upload de documento PDF excedendo o limite de tamanho
*   **Given** que o administrador acessa o painel de upload da base de conhecimento.
*   **When** arrasta ou seleciona um arquivo de documento PDF com tamanho de 15MB.
*   **Then** o frontend valida o tamanho localmente e bloqueia o upload.
*   **And** exibe uma mensagem de alerta em vermelho: "O arquivo excede o limite máximo permitido de 10MB".

### Cenário 7: Upload e fragmentação automatizada de documento PDF válido
*   **Given** que existem 10 documentos ativos cadastrados no sistema (abaixo do limite de 50).
*   **When** o administrador carrega um arquivo PDF válido `'politicas_reservas.pdf'` com 2MB.
*   **Then** o arquivo é transmitido para o bucket de storage `'documentos-conhecimento'`.
*   **And** cria uma linha em `public.documentos_base_conhecimento` com os metadados do arquivo.
*   **And** o backend extrai o texto do arquivo, quebra o conteúdo em blocos menores que 4000 caracteres e cria registros correspondentes na tabela `public.base_conhecimento` com o `documento_id` correspondente.

### Cenário 8: Exclusão em cascata de documento e seus blocos RAG
*   **Given** que existe um documento `'regras.docx'` que gerou 5 blocos de artigos na base de conhecimento.
*   **When** o administrador acessa a lista de documentos e clica no botão "Excluir" correspondente a `'regras.docx'`.
*   **Then** o registro do documento é deletado de `public.documentos_base_conhecimento`.
*   **And** todos os 5 artigos de base de conhecimento que possuem o `documento_id` daquele arquivo são automaticamente apagados (`ON DELETE CASCADE`).
*   **And** o arquivo físico no bucket `'documentos-conhecimento'` é apagado do Supabase Storage.

### Cenário 9: Edição em tempo real e uso do prompt mestre
*   **Given** que o administrador acessa a aba "Prompt da IA".
*   **When** altera o system prompt contendo as instruções de atendimento da persona e clica em "Salvar Alterações".
*   **Then** o sistema grava o novo conteúdo na tabela `public.configuracoes_sistema` na chave `'SOFIA_SYSTEM_PROMPT'`.
*   **And** insere um log em `public.logs_auditoria` com a ação `'atualizar_prompt_sistema'`.
*   **And** a próxima mensagem inbound que passar pelo pipeline de RAG Sofía utilizará imediatamente as novas instruções recém-gravadas.

---

## 4. Planejamento de Banco de Dados e Migração Lógica

Abaixo, descreve-se a estrutura das alterações lógicas que serão refletidas na migração física correspondente:

### 4.1 Modificações de Tabelas Existentes
1.  **Tabela `public.clientes`**:
    *   Remoção do modificador `NOT NULL` da coluna `telefone` (`ALTER TABLE public.clientes ALTER COLUMN telefone DROP NOT NULL;`).
    *   Adição da coluna `telegram_chat_id` (`VARCHAR(100) UNIQUE`).
2.  **Tabela `public.mensagens`**:
    *   Adição da coluna `telegram_mensagem_id` (`VARCHAR(100) UNIQUE`).
3.  **Tabela `public.base_conhecimento`**:
    *   Adição da coluna `documento_id` (`UUID REFERENCES public.documentos_base_conhecimento(id) ON DELETE CASCADE`).

### 4.2 Criação da Tabela `public.documentos_base_conhecimento`
*   A tabela registrará cada arquivo PDF ou DOCX enviado:
    *   `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
    *   `nome_arquivo` VARCHAR(255) NOT NULL
    *   `tamanho_bytes` BIGINT NOT NULL
    *   `tipo_mime` VARCHAR(100) NOT NULL
    *   `caminho_storage` TEXT NOT NULL
    *   `data_criacao` TIMESTAMPTZ DEFAULT `now()`
    *   `data_atualizacao` TIMESTAMPTZ DEFAULT `now()`

### 4.3 Políticas de RLS para Documentos
*   Habilitação de Row Level Security para `public.documentos_base_conhecimento`.
*   Criação de política concedendo privilégio completo (`ALL`) aos perfis com funções de `'admin'` e `'supervisor'`.
*   Bloqueio completo de escrita para usuários de perfil `'cliente'` e anônimos.
