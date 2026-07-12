# Task Breakdown: Chat do Cliente e Histórico (Épica 2)

**ID da Mudança:** `epica2-client-chat`  
**Status:** `Planejado`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador deve solicitar autorização do usuário antes de aplicar as mudanças)  

*Justificativa:* O escopo da Épica 2 é extenso. Envolve migrações de banco de dados (dois enums novos, tabelas `conversas` e `mensagens`, constraints de checagem, triggers de atualização, 7 políticas RLS novas e ativação de replicação em tempo real), criação de políticas para o bucket `chat-midias`, lógica de validação complexa com Zod, além de páginas e componentes Next.js robustos (Server Component para verificação de sessão e inicialização da conversa ativa, Client Component de Chat com hooks de assinatura em tempo real, manipulação de scroll com `useRef`, animações e estados dinâmicos). O volume total de código modificado deve alcançar entre 500 e 600 linhas, superando o limite ideal de 400 linhas para uma única revisão de PR.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Database & Storage Migrations
*   **Descrição:** Criação da migração PostgreSQL contendo os enums de chat, tabelas de conversas e mensagens com restrições e triggers apropriados, políticas de Row Level Security (RLS) para isolar mensagens por cliente e liberar acesso a operadores cadastrados, ativação de replicação Realtime do Supabase e definição das políticas de segurança para upload e leitura de mídias no bucket `chat-midias`.
*   **Riscos associados:** Políticas RLS excessivamente restritivas bloqueando inserções legítimas de mensagens, falha na habilitação da replicação Realtime para as tabelas criadas.

### Work Unit 2: Frontend Layout & UI
*   **Descrição:** Configuração da rota `/cliente/chat` com Server Component que gerencia sessão e garante a existência de uma conversa ativa no banco de dados, definição do schema Zod `novaMensagemSchema` para validação no frontend, e estruturação visual do chat usando Tailwind com suporte a tema escuro/glassmorfismo (balões diferenciados de mensagens para cliente, IA e operador, campo de digitação resiliente e área de carregamento de anexo).
*   **Riscos associados:** Carregamento ineficiente das mensagens iniciais causando atrasos visuais, quebra no layout responsivo em dispositivos móveis (ex: teclado virtual escondendo o campo de texto).

### Work Unit 3: Realtime Subscription & Scroll
*   **Descrição:** Implementação da inscrição de tempo real com Supabase Client no componente de chat para capturar inserções de novas mensagens e atualizações no estado da conversa (como alteração do atendente ou encerramento), lógica para atualizar o estado local dinamicamente, comportamento de scroll automático ao final do histórico com referências mutáveis, exibição de badge de status dinâmico ("Sofia (IA)" ou "Atendente Humano") e bloqueio de input quando a conversa for encerrada.
*   **Riscos associados:** Assinaturas duplicadas causando re-renderizações ou exibição duplicada de mensagens no cliente, perda de mensagens em tempo real se a conexão oscilar.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: Database & Storage (Banco de Dados & Storage)

- [x] **1.1** Criar o arquivo de migração em `supabase/migrations/20260704140000_epica2_client_chat.sql`.
- [x] **1.2** Definir os enums `public.status_conversa` ('ia_atendendo', 'aberta', 'fechada') e `public.tipo_remetente` ('cliente', 'operador', 'ia').
- [x] **1.3** Criar a tabela `public.conversas` com relacionamentos a `clientes(id)` e triggers de data de atualização.
- [x] **1.4** Criar a tabela `public.mensagens` vinculada a `conversas(id)`, definindo a restrição de checagem `chk_conteudo_ou_anexo` para garantir que texto ou URL de anexo estejam populados.
- [x] **1.5** Configurar políticas RLS para a tabela `conversas`, garantindo que clientes leiam e criem apenas suas próprias conversas, e operadores com funções elegíveis visualizem todas.
- [x] **1.6** Configurar políticas RLS para a tabela `mensagens`, permitindo leitura ao dono da conversa e aos operadores, e inserção apenas em conversas ativas (status diferente de 'fechada') com remetente 'cliente'.
- [x] **1.7** Habilitar a publicação das tabelas `conversas` e `mensagens` no canal `supabase_realtime`.
- [x] **1.8** Criar as políticas RLS de leitura e escrita para o bucket de mídias `chat-midias` em `storage.objects` limitando por ID de dono (`auth.uid() = owner`) ou funções de operador.
- [x] **1.9** Atualizar a seed em `supabase/seed.sql` incluindo conversas de exemplo para testes de desenvolvimento local.

### Fase 2: Next.js Boilerplate & UI (Next.js & UI do Chat)

- [x] **2.1** Desenvolver o arquivo de validação `src/lib/validation/chat.ts` contendo o schema `novaMensagemSchema` com validações Zod e refinamento personalizado para conteúdo ou anexo.
- [x] **2.2** Criar a rota Server Component em `src/app/cliente/chat/page.tsx` para buscar a sessão do cliente, verificar se já possui uma conversa ativa (status diferente de 'fechada') ou criar uma nova se necessário, ler as últimas 50 mensagens ordenadas por data de criação e renderizar o container de chat.
- [x] **2.3** Criar o componente visual de container do chat em `src/components/chat/ChatContainer.tsx` utilizando Tailwind e estruturando as áreas de cabeçalho, corpo de mensagens e rodapé de inserção.
- [x] **2.4** Desenvolver a renderização de balões de mensagens diferenciados por remetente (cor de fundo e alinhamento à direita para o cliente, tons neutros/suaves à esquerda para a IA Sofía, e cor de destaque operacional para operadores humanos).
- [x] **2.5** Implementar o rodapé com textarea adaptativo para digitação e botão de anexo que realiza o upload da mídia para o bucket `chat-midias` antes do envio.

### Fase 3: Realtime & Logic (Assinatura Realtime & Lógica)

- [x] **3.1** Integrar a assinatura de eventos em tempo real (`supabase.channel`) no `ChatContainer.tsx` focado na conversa atual do cliente, escutando novos inserts em `mensagens` e updates em `conversas`.
- [x] **3.2** Implementar a lógica de conciliação de estado no cliente para anexar novas mensagens recebidas via tempo real de forma atômica e evitar duplicados.
- [x] **3.3** Implementar a lógica para escutar alterações de status da conversa e bloquear os inputs de texto e upload de imagens quando o status transitar para `'fechada'`.
- [x] **3.4** Criar o indicador de assistente ativo no cabeçalho: exibir badge verde pulsante "Sofia (IA)" se `ia_ativa` for `true` (e status for `ia_atendendo`), e badge azul "Atendente Humano" quando desativada.
- [x] **3.5** Implementar o hook de scroll automático gerenciando a referência visual do elemento container das mensagens (`useRef`) para rolar a tela suavemente até a mensagem mais recente ao carregar a página ou receber novas mensagens.

### Fase 4: Integration & Testing (Integração & Validação)

- [x] **4.1** Desenvolver scripts de teste para verificar o correto funcionamento das políticas RLS no banco de dados e no Supabase Storage.
- [x] **4.2** Realizar testes de ponta a ponta (E2E) simulando o fluxo de envio de mensagens de texto e arquivos de mídia.
- [x] **4.3** Validar o bloqueio de envio de mensagens em conversas cujo status foi modificado para fechado.
- [x] **4.4** Revisar conformidade com LGPD nos logs de execução do chat.
