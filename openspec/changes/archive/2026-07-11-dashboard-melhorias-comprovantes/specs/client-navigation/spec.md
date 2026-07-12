# Delta for client-navigation

## MODIFIED Requirements

### Requirement: REQ-NAV-002 - Abas de Navegação Dinâmicas
O layout compartilhado MUST conter abas persistentes "Chat" e "Perfil" que MUST exibir estilo ativo dinâmico com base na rota atual.
(Previously: O layout compartilhado MUST conter abas de navegação persistentes de fácil alternância entre "Chat" e "Perfil".)

#### Scenario: Alternância com estilo dinâmico
- GIVEN o cliente logado em `/cliente/chat`
- WHEN o cliente clica na aba "Perfil"
- THEN a rota atualiza para `/cliente/perfil` sem recarregar a página
- AND a aba "Perfil" exibe estilo ativo e "Chat" não

## ADDED Requirements

### Requirement: REQ-NAV-006 - Logout Redirects
O logout de clientes MUST redirecionar para `/`. O logout de staff MUST redirecionar para `/login`.

#### Scenario: Logout de cliente
- GIVEN um cliente autenticado em `/cliente`
- WHEN realiza logout
- THEN o sistema encerra a sessão e redireciona para `/`

#### Scenario: Logout de staff
- GIVEN um staff autenticado em `/atendimento`
- WHEN realiza logout
- THEN o sistema encerra a sessão e redireciona para `/login`

### Requirement: REQ-NAV-007 - Auto-logout de Staff Inativo
Membros de staff inativos por 15 minutos MUST ser desconectados automaticamente.

#### Scenario: Auto-logout por inatividade
- GIVEN um staff autenticado em `/atendimento`
- WHEN nenhuma atividade (mouse, teclado, cliques) ocorre por 15 minutos
- THEN o sistema encerra a sessão e redireciona para `/login`
