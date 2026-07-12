# Task Breakdown: Dashboard Administrativo, Gestão de Operadores e Auditoria (Épica 8)

**ID da Mudança:** `epica8-dashboard-admin`  
**Status:** `Concluído`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador deve solicitar autorização do usuário antes de aplicar as mudanças)  

*Justificativa:** A Épica 8 envolve modificações de banco de dados (tabela de logs de auditoria e políticas RLS restritas), lógica de middleware para proteger subrotas de `/atendimento/admin`, Server Actions com validações de segurança (anti-lockout, quantidade mínima de administradores e integração com Google Calendar), interface visual rica baseada em abas com tabela de operadores, métricas de atendimento e logs, além de uma suíte completa de testes de integração. Estima-se um total de 550 a 600 linhas de código alteradas.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: DB Migration & Middleware Protection
*   **Descrição:** Criação do arquivo de migração para a tabela `logs_auditoria` com RLS imutável e comentários detalhados, além de atualizar o `middleware.ts` para restringir rotas `/atendimento/admin` a administradores e supervisores.
*   **Riscos associados:** Bloqueio indesejado de rotas legítimas de atendimento por conta de ordem incorreta no middleware.

### Work Unit 2: Server Actions & Safety Rules
*   **Descrição:** Desenvolvimento de `src/app/actions/admin.ts` contendo as funções de listagem de operadores com autenticação administrativa, atualização de perfis com regras estritas de anti-lockout e contagem de admins ativos, teste de conexão do Google Calendar e estatísticas de mensagens.
*   **Riscos associados:** Risco de segurança por uso indevido do client do Supabase com Service Role. Deve-se validar estritamente a sessão e a função do usuário logado no início de cada Server Action.

### Work Unit 3: Visual Administrator Dashboard
*   **Descrição:** Implementação do Server Page `/atendimento/admin/page.tsx` para validação de acesso no servidor e renderização do componente cliente `src/components/operator/AdminDashboard.tsx`. O dashboard conterá abas para operadores (CRUD rápido e lockout protection), integrações (teste do Google Calendar), métricas (IA vs Humano), auditoria (logs) e visualizador do prompt.
*   **Riscos associados:** Vazamento visual de credenciais sensíveis (Google Calendar API Client Email / ID / Private Key). É obrigatório mascarar ou omitir esses dados no cliente.

### Work Unit 4: Verification & Integration Tests
*   **Descrição:** Implementação de `scripts/test-admin-integration.js` para cobrir todos os fluxos críticos de ponta a ponta: proteção do middleware, tentativa de auto-desativação (lockout), bloqueio de desativação do único admin, inserção e consulta de logs via RLS, cálculo de estatísticas e mascaramento de variáveis.
*   **Riscos associados:** Suíte de testes poluindo dados reais de produção se não estiver devidamente configurada para o emulador local.

---

## 3. Lista Hierárquica de Tarefas

### Phase 1: Database & Middleware (Banco de Dados & Middleware)

- [x] **1.1** Criar o arquivo de migração `supabase/migrations/20260705000000_epica8_dashboard_admin.sql`.
- [x] **1.2** Adicionar a definição da tabela `public.logs_auditoria` com colunas `id`, `usuario_id`, `acao` e `detalhes` (JSONB) no arquivo de migração, aplicando comentários de documentação nas tabelas e colunas.
- [x] **1.3** Habilitar Row Level Security (RLS) em `public.logs_auditoria`.
- [x] **1.4** Criar as políticas de segurança RLS: leitura (`SELECT`) apenas por perfis 'admin' e 'supervisor', e escrita (`INSERT`) sob as mesmas condições. Não definir políticas de `UPDATE` ou `DELETE`, garantindo a imutabilidade dos logs.
- [x] **1.5** Alterar o arquivo [middleware.ts](file:///home/wilkin/proyectos/Asados/middleware.ts) na raiz para identificar requisições direcionadas a rotas filhas de `/atendimento/admin` e restringir acesso exclusivamente para usuários autenticados cujos perfis possuam função 'admin' ou 'supervisor'.

### Phase 2: Server Actions & Logic (Ações de Servidor & Regras de Segurança)

- [x] **2.1** Criar o arquivo `src/app/actions/admin.ts` para agrupar todas as Server Actions administrativas da Épica 8.
- [x] **2.2** Desenvolver a Server Action `listarUsuariosAdmin()` utilizando o cliente administrativo do Supabase (Service Role) para consolidar a lista de usuários do Auth com seus respectivos perfis e-mail/função na tabela `perfis`.
- [x] **2.3** Desenvolver a Server Action `atualizarPerfilUsuario()` contendo a validação backend contra auto-desativação ou auto-rebaixamento de cargo (anti-lockout) e a validação de no mínimo um administrador ativo restante no banco.
- [x] **2.4** Adicionar na lógica de `atualizarPerfilUsuario()` a inserção automática de uma entrada na tabela de `public.logs_auditoria` registrando a ação do administrador que a executou.
- [x] **2.5** Implementar a Server Action `testarGoogleCalendar()` que realiza o agendamento de um evento de teste de 15 minutos e registra o resultado (sucesso ou falha) em `public.logs_auditoria`.
- [x] **2.6** Desenvolver a Server Action `obterEstatisticasMensagens()` para buscar a contagem total de mensagens filtradas por remetente ('cliente', 'operador' e 'ia') e computar a taxa percentual de automação.

### Phase 3: Dashboard Interface (Interface Gráfica do Dashboard)

- [x] **3.1** Criar a página de servidor `src/app/atendimento/admin/page.tsx` validando se a sessão do usuário é válida e se possui perfil administrativo, antes de carregar o painel principal.
- [x] **3.2** Desenvolver o componente do lado do cliente `src/components/operator/AdminDashboard.tsx` utilizando as abas da interface do usuário (Tabs do shadcn/ui).
- [x] **3.3** Implementar a aba **Operadores** no dashboard, exibindo a listagem, dropdown de troca de função e switch de ativação. Incluir modal de confirmação visual para alterações críticas e desabilitar interações no próprio usuário logado.
- [x] **3.4** Desenvolver a aba **Integrações** exibindo as variáveis `GOOGLE_CALENDAR_ID` e `GOOGLE_CLIENT_EMAIL` devidamente mascaradas, o status de configuração de `GOOGLE_PRIVATE_KEY` e o botão para chamar a Server Action `testarGoogleCalendar()`.
- [x] **3.5** Construir a aba **Métricas** com os indicadores de mensagens e um gráfico circular ou barra de proporção ilustrando a taxa de automação da IA.
- [x] **3.6** Desenvolver a aba **Auditoria** exibindo uma tabela paginada dos logs de auditoria retornados de `public.logs_auditoria` com um modal ou área expansível para visualização estruturada dos detalhes em JSON.
- [x] **3.7** Implementar a aba **Prompt da IA** exibindo de forma estática e somente leitura o Master System Prompt da Sofia.

### Phase 4: Integration Testing (Testes de Integração & Validação)

- [x] **4.1** Criar o arquivo `scripts/test-admin-integration.js` configurado para rodar contra o emulador local do Supabase.
- [x] **4.2** Escrever os testes de integração para o Middleware, simulando requisições com tokens de cliente, vendedor, supervisor e admin e verificando se os redirects ocorrem de acordo.
- [x] **4.3** Codificar os cenários de teste para as regras de segurança de `atualizarPerfilUsuario()` cobrindo: tentativa de desativar a si próprio (rejeitada), desativação do último admin (rejeitada) e alteração válida de função e status (aprovada e registrada em logs).
- [x] **4.4** Escrever testes de integração para testar a imutabilidade física da tabela `public.logs_auditoria` via políticas RLS (tentativas de UPDATE ou DELETE devem falhar).
- [x] **4.5** Adicionar asserções de validação para a lógica de cálculo de estatísticas e mascaramento de credenciais.
