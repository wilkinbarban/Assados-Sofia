# Task Breakdown: Autenticação e Validação de Telefone (Épica 1)

**ID da Mudança:** `epica1-auth-otp`  
**Status:** `Planejado`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador deve solicitar autorização do usuário antes de aplicar as mudanças)  

*Justificativa:* O escopo da Épica 1 é amplo, abrangendo a criação da infraestrutura de banco de dados (tabelas, triggers, RLS, RPC de merge), configuração de autenticação do Supabase no Next.js (SSR helpers, middleware.ts), duas rotas de API robustas com rate-limiting e integração externa simulada (WhatsApp), além de quatro telas completas no frontend (Cadastro, Login, Verificação de Telefone e Configurações). Estima-se um total de 600 a 800 linhas de código alteradas.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Foundation & Migrations
*   **Descrição:** Configuração de esquemas de banco de dados locais do Supabase, definições de enums, políticas de RLS estritas, triggers automáticos para criação de perfis, a RPC de fusão de contas (`mesclar_contas`) e dados iniciais para testes locais (seed data).
*   **Riscos associados:** Erros de sintaxe PL/pgSQL na RPC de fusão, regras de RLS bloqueando acessos válidos.

### Work Unit 2: Backend Auth & API Routes
*   **Descrição:** Configuração dos helpers de autenticação do Supabase (`@supabase/ssr`), implementação do `middleware.ts` para proteção de rotas por função e bloqueio de usuários inativos, e desenvolvimento das rotas `/api/auth/otp` e `/api/auth/verify-otp` contendo regras de rate limit.
*   **Riscos associados:** Loops de redirecionamento no middleware, vazamento de credenciais nos logs, falha de consistência de sessão entre Server Actions e API Routes.

### Work Unit 3: Frontend Views
*   **Descrição:** Telas de `/cadastro` (registro de clientes), `/login` (acesso centralizado), `/cliente/verificar-telefone` (bloqueio e OTP via WhatsApp) e `/cliente/configuracoes` (atualização cadastral e fluxo de troca de telefone).
*   **Riscos associados:** Validação de máscara incorreta no cliente, tempo de expiração do OTP dessincronizado do backend.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: Foundation (Banco de Dados & Infraestrutura)

- [x] **1.1** Criar arquivo de migração inicial `supabase/migrations/20260703210000_epica1_auth_otp.sql`.
- [x] **1.2** Definir o enum `tipo_funcao` ('admin', 'supervisor', 'vendedor', 'cliente') e criar a tabela `perfis` associada a `auth.users`, incluindo a coluna `ativo` e triggers de auditoria.
- [x] **1.3** Implementar a função trigger `public.ao_criar_usuario()` e o respectivo trigger `tr_ao_criar_usuario` após insert em `auth.users` para inicializar perfis como 'cliente'.
- [x] **1.4** Criar as tabelas `clientes` (contendo restrição `chk_telefone_curitiba` para regex `^55419[0-9]{8}$`) e `codigos_verificacao` (com restrição `chk_otp_telefone_curitiba`).
- [x] **1.5** Desenvolver a RPC `mesclar_contas(p_usuario_id, p_telefone, p_endereco)` executando a fusão de contas em transação única atômica.
- [x] **1.6** Configurar políticas RLS estritas nas tabelas `perfis` (leitura pública ou por próprio usuário, alteração apenas pelo dono/admin) e `clientes` (leitura/escrita apenas pelo próprio usuário ou admin).
- [x] **1.7** Criar ou atualizar `supabase/seed.sql` com dados fictícios de perfis de testes (admin, vendedor e cliente com telefone já populado para validar merge).

### Fase 2: Backend (Autenticação, Middleware & APIs)

- [x] **2.1** Configurar helpers do `@supabase/ssr` em `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` e `src/lib/supabase/middleware.ts`.
- [x] **2.2** Implementar `middleware.ts` na raiz do Next.js para interceptar requisições, ler JWT dos cookies seguros, validar permissões da rota versus papel em `perfis`, e bloquear sessões de perfis inativos (`ativo = false`).
- [x] **2.3** Desenvolver o Route Handler `src/app/api/auth/otp/route.ts` para sanitizar o telefone, validar a regex Curitiba, impor rate limit de 60s em `codigos_verificacao`, persistir o OTP e disparar a Meta Cloud API (com mock de console para ambiente local).
- [x] **2.4** Desenvolver o Route Handler `src/app/api/auth/verify-otp/route.ts` para receber o código OTP, validar expiração (10 min) e flag `verificado`, marcar como utilizado, e disparar a RPC `mesclar_contas`.
- [x] **2.5** Garantir leitura segura de credenciais sensíveis (`SUPABASE_SERVICE_ROLE_KEY`, `META_WHATSAPP_TOKEN`) exclusivamente de variáveis de ambiente.

### Fase 3: Frontend (Telas & Experiência do Usuário)

- [x] **3.1** Criar página `/cadastro` (`src/app/cadastro/page.tsx`) contendo formulário de Nome, E-mail e Senha. Implementar validação Zod (mínimo 8 caracteres, maiúscula, minúscula, número) no client-side.
- [x] **3.2** Criar página `/login` (`src/app/login/page.tsx`) com formulário de credenciais e mensagens de erro específicas para e-mail não confirmado ou conta inativa.
- [x] **3.3** Implementar a página de bloqueio `/cliente/verificar-telefone` (`src/app/cliente/verificar-telefone/page.tsx`) exibindo input de telefone com máscara visual `(41) 9XXXX-XXXX` e botão para envio do código OTP.
- [x] **3.4** Adicionar componente de entrada do código OTP (6 inputs numéricos) com contador de reenvio de 60 segundos desabilitando o botão.
- [x] **3.5** Criar página de configurações `/cliente/configuracoes` (`src/app/cliente/configuracoes/page.tsx`) permitindo atualização de nome, endereço e senha.
- [x] **3.6** Criar modal de validação OTP em `/cliente/configuracoes` que dispara ao tentar alterar o número de telefone, mantendo o número antigo ativo no banco até a confirmação do novo código.

### Fase 4: Testing & Cleanup (Validação & Testes)

- [x] **4.1** Desenvolver testes locais de políticas RLS em Supabase (utilizando pgTAP ou script alternativo de validação de queries) provando isolamento de dados de clientes.
- [x] **4.2** Criar suite de testes de integração para as rotas `/api/auth/otp` e `/api/auth/verify-otp`.
- [x] **4.3** Validar o fluxo de ponta a ponta (Cenário de Sucesso, Cenário de Merge, Cenário de Erro de DDD, Cenário de Rate Limit e Expiração).
- [x] **4.4** Remover logs excessivos de dados pessoais (PII) e garantir conformidade LGPD.
