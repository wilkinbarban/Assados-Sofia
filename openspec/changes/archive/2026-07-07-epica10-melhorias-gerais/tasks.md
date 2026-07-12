# Task Breakdown: Melhorias Gerais (Épica 10)

**ID da Mudança:** `epica10-melhorias-gerais`  
**Status:** `Planejado`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Delivery strategy:** `auto-chain`  
*   **Chain strategy:** `feature-branch-chain`  

*Justificativa:* O escopo da Épica 10 é substancial e heterogêneo. Ele altera a estrutura do banco de dados (tabelas `clientes`, `mensagens`, `base_conhecimento` e uma nova tabela `documentos_conhecimento`), exige a criação de uma rota de webhook para o Telegram com regras complexas de RAG, implementa redefinições de perfil e senha no Supabase Auth via Server Actions, e adiciona suporte a upload e parsing de arquivos PDF/DOCX no servidor. O total estimado de linhas modificadas excede facilmente 600 linhas em múltiplos componentes do sistema, justificando a estratégia de PRs encadeados para manter cada revisão de código abaixo de 400 linhas.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Database Migration, Configuration Schema, and Storage Bucket
*   **Descrição:** Configuração de novas tabelas, alterações nas colunas existentes de clientes e mensagens, habilitação de políticas de Row Level Security (RLS) e criação do bucket privado `documentos-conhecimento` no Supabase Storage.
*   **Riscos associados:** Configuração incorreta de políticas de segurança (RLS) que impeçam vendedores/supervisores de interagir com os documentos, ou falha ao desativar a restrição `NOT NULL` do telefone no banco de dados.

### Work Unit 2: Master Prompt Editor, Two-Column Grid UI & Unified WhatsApp Card
*   **Descrição:** Reestruturação visual do painel de integrações para grid responsivo de duas colunas, remoção dos cards de integrações legados, unificação no componente `WhatsAppCard` com grayscale dinâmico de provedor ativo, e editor em tempo real do prompt mestre da Sofía com persistência e histórico de logs de auditoria.
*   **Riscos associados:** Quebra de layouts legados no dashboard e falha de compatibilidade caso a chave de prompt no banco de dados esteja vazia durante a inicialização do formulário.

### Work Unit 3: Telegram Bot Connection & Webhook Routing
*   **Descrição:** Implementação do utilitário de envio de mensagens no Telegram, criação do webhook inbound `/api/webhooks/telegram` para tratamento de mensagens do cliente, geração automática de novos contatos sem telefone de Curitiba e disparo do pipeline de IA integrado com RAG.
*   **Riscos associados:** Atrasos na resposta HTTP ao Telegram webhook, o que faria a rede do Telegram reenviar a mesma mensagem em loop, gerando duplicidade (exige controle rígido de idempotência).

### Work Unit 4: Operator Profile Module
*   **Descrição:** Desenvolvimento da página gerencial `/atendimento/perfil` para administradores, supervisores e vendedores gerenciarem seus dados (nome completo e alteração de senha de acesso), incluindo links rápidos no header e sidebar e registro de logs de auditoria de forma anonimizada.
*   **Riscos associados:** Vulnerabilidade que permita que um usuário mal-intencionado edite a senha de outro operador no backend, ou falha de expiração de sessão local no Supabase após a redefinição de senha.

### Work Unit 5: Knowledge Base PDF/DOCX Uploads & Server-side Parser
*   **Descrição:** Instalação das bibliotecas `pdf-parse` e `mammoth` no servidor, implementação da Server Action de importação e processamento com limite de 10MB por arquivo e limite total de 50 documentos, segmentação (chunking) automática de blocos de até 4000 caracteres no banco, e deleção em cascata dos chunks do documento quando excluído.
*   **Riscos associados:** Vazamentos de memória durante o processamento de PDFs com imagens ou muito pesados no ambiente Docker.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: Foundation & Banco de Dados (WU 1)

- [x] **1.1** Criar o arquivo de migração `supabase/migrations/20260707000000_epica10_melhorias_gerais.sql`.
- [x] **1.2** Alterar a coluna `telefone` da tabela `public.clientes` para remover o modificador `NOT NULL`, e adicionar a coluna `telegram_chat_id` `VARCHAR(100) UNIQUE`.
- [x] **1.3** Adicionar a coluna `telegram_mensagem_id` `VARCHAR(100) UNIQUE` na tabela `public.mensagens` para suporte à idempotência de webhooks.
- [x] **1.4** Criar a tabela `public.documentos_conhecimento` para registrar os metadados de PDFs/DOCXs carregados, contendo: `id`, `nome_arquivo`, `tamanho_bytes`, `tipo_mime`, `caminho_storage`, `data_criacao` e `data_atualizacao`.
- [x] **1.5** Criar o trigger para atualização automática de timestamp na tabela `public.documentos_conhecimento`.
- [x] **1.6** Adicionar a coluna `documento_id` `UUID REFERENCES public.documentos_conhecimento(id) ON DELETE CASCADE` na tabela `public.base_conhecimento`.
- [x] **1.7** Habilitar RLS na tabela `public.documentos_conhecimento` e criar políticas permitindo controle total (`ALL`) para perfis com funções de `'admin'`, `'supervisor'` e `'vendedor'`.
- [x] **1.8** Adicionar instrução SQL para criar o bucket privado `documentos-conhecimento` com limite de arquivo de 10MB e restringir tipos MIME aceitáveis (`application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
- [x] **1.9** Configurar políticas de RLS no bucket para leitura, escrita e deleção restritas a operadores autenticados com as funções autorizadas.

### Fase 2: Backend & Lógica de Integração (WU 3, WU 5 & WU 2 backend)

- [x] **2.1** Instalar as dependências de análise de arquivos no servidor: `npm install pdf-parse mammoth` e os respectivos `@types/` de desenvolvimento, se aplicável.
- [x] **2.2** Atualizar o utilitário `obterProvedorAtivo` em `src/lib/whatsapp/provider.ts` para ler a chave `'PROVEDOR_WHATSAPP_ATIVO'` do banco de dados, mantendo fallback de leitura para a variável `'WHATSAPP_PROVIDER'`.
- [x] **2.3** Atualizar o pipeline RAG em `src/lib/ai/openrouter.ts` para buscar o prompt de sistema em tempo real a partir da chave `'SOFIA_SYSTEM_PROMPT'` na tabela `public.configuracoes_sistema`, mantendo o prompt estático atual como fallback padrão.
- [x] **2.4** Desenvolver a lógica do remetente do Telegram em `src/lib/telegram/send.ts`, implementando o método `enviarMensagemTelegram(conversaId, payload)` para envio de mensagens de suporte e envio de mídias/anexos via API do Telegram.
- [x] **2.5** Implementar a Server Action `testarConexaoTelegram(token)` em `src/app/actions/admin.ts` para validar o token contra a rota `/getMe` da API de bots do Telegram.
- [x] **2.6** Criar a rota de API de Webhook `/api/webhooks/telegram/route.ts` para escutar novos updates. Deve filtrar apenas mensagens de texto, verificar a idempotência via `telegram_mensagem_id`, obter/criar o registro em `public.clientes` e a conversa ativa (`status = 'ia_atendendo'`), e disparar a resposta RAG Sofía em segundo plano.
- [x] **2.7** Criar a Server Action `importarDocumentoConhecimento` em `src/app/actions/conhecimento.ts` para receber dados do arquivo, validar tamanho/tipo MIME, contar se a tabela está abaixo do limite de 50 registros, e salvar o binário no bucket.
- [x] **2.8** Implementar a rotina de parser textual do arquivo PDF/DOCX no backend e segmentá-lo semanticamente em chunks de texto de até 4000 caracteres, inserindo os novos registros em `public.base_conhecimento` associados ao `documento_id`.
- [x] **2.9** Implementar a Server Action para exclusão de documentos que remova o registro da tabela `public.documentos_conhecimento` e delete o arquivo físico do bucket do Supabase Storage.

### Fase 3: Frontend & Experiência de Usuário (WU 2, WU 4 & WU 5 frontend)

- [x] **3.1** Modificar o layout de cards na aba de Integrações do `AdminDashboard.tsx` para renderizar em grade responsiva utilizando as classes Tailwind `grid grid-cols-1 lg:grid-cols-2 gap-6`.
- [x] **3.2** Criar o componente unificado `WhatsAppCard.tsx` sob `src/components/operator/integrations/`, exibindo campos exclusivos para Evolution ou Meta de acordo com o switch de provedor ativo, aplicando grayscale e overlay de opacidade à seção inativa.
- [x] **3.3** Remover os arquivos obsoletos `MetaWhatsAppCard.tsx` e `EvolutionApiCard.tsx` e limpar as referências de importação no projeto.
- [x] **3.4** Adicionar o card visual "Telegram Bot" na lista de integrações do dashboard administrativo, permitindo edição de token, teste de conexão e salvamento.
- [x] **3.5** Criar a aba "Prompt da IA" no `AdminDashboard.tsx` contendo o campo de formulário do Prompt Mestre da Sofía com suporte a salvar alterações por meio de uma Server Action dedicada.
- [x] **3.6** Criar a página de Perfil do Operador em `/src/app/atendimento/perfil/page.tsx` com formulário amigável para alteração do Nome de exibição e formulário para alteração de senha.
- [x] **3.7** Implementar as Server Actions `atualizarPerfilProprio` e `atualizarSenhaPropria` com validações no servidor (usuário logado, restrição de perfil, etc.) e gravação de logs de auditoria no formato anonimizado (LGPD).
- [x] **3.8** Adicionar links de navegação para a página de perfil no Header do operador em `/atendimento` e acima do botão Sair na Sidebar do administrador.
- [x] **3.9** Implementar o widget de upload de arquivos (PDF e DOCX) no componente `KnowledgeCRUD.tsx` com validações visuais de tamanho (< 10MB) e de tipo de arquivo.

### Fase 4: Testing & Homologação

- [x] **4.1** Validar testes de parsing de PDF e DOCX com acentuação, quebras de linhas e formatação especial, assegurando que o limite de 4000 caracteres não seja ultrapassado e as relações de chave estrangeira fiquem consistentes.
- [x] **4.2** Testar a integridade da exclusão em cascata: excluir um documento e comprovar que os chunks correspondentes sumiram de `public.base_conhecimento` e o arquivo físico foi apagado do storage.
- [x] **4.3** Testar a idempotência de mensagens recebidas pelo Telegram enviando o mesmo payload de webhook repetidas vezes e verificando se apenas um registro de mensagem foi gerado.
- [x] **4.4** Validar o fluxo de criação automática de cliente via Telegram sem telefone e assegurar que as mensagens com RAG Sofía utilizem o Prompt Mestre configurado no banco de dados.
- [x] **4.5** Executar testes na interface de alteração de perfil e troca de senha para certificar que o login do Supabase permaneça estável e os cookies de sessão do Next.js fiquem atualizados após a troca de credenciais.
- [x] **4.6** Gerar documentação no arquivo `README.md` do projeto detalhando o procedimento manual de configuração do Supabase Cloud (Site URL, Redirect URLs e Email Templates) para homologação.
