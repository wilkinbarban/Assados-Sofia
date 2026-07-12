# Especificação de Requisitos: Navegação da Área do Cliente (client-navigation)

**ID da Mudança:** `cliente-chat-modulo`  
**Domínio:** `client-navigation`  
**Status:** `Pendente de Revisão`  

---

## 1. Descrição Executiva
Esta especificação descreve a estrutura de navegação e layout da área restrita do cliente final, introduzindo uma barra de navegação/abas para alternar entre as visões de Chat e Perfil, definindo o fluxo de redirecionamento de rotas e migrando as configurações mantendo a verificação de autenticação de telefone ativa.

---

## 2. Requisitos de Sistema (RFC 2119)
*   **REQ-NAV-001**: O sistema MUST fornecer um layout aninhado compartilhado (`layout.tsx`) para todas as páginas sob `/cliente`.
*   **REQ-NAV-002**: O layout compartilhado MUST conter abas de navegação persistentes de fácil alternância entre "Chat" e "Perfil".
*   **REQ-NAV-003**: A rota `/cliente` MUST, por padrão, direcionar ou renderizar a aba de Chat (`/cliente/chat`).
*   **REQ-NAV-004**: As configurações do usuário e o fluxo de verificação de novo número de telefone MUST ser migrado de `/cliente/configuracoes` para `/cliente/perfil`.
*   **REQ-NAV-005**: A navegação e migração das rotas SHALL NOT contornar ou quebrar as validações de autenticação e verificação de telefone intermediadas pelo middleware.

---

## 3. Cenários de Aceitação (Gherkin)

### Cenário: Redirecionamento automático ao acessar a área cliente
*   **Given** que o cliente está autenticado e com telefone verificado.
*   **When** o cliente acessa diretamente `/cliente`.
*   **Then** o sistema redireciona o cliente para a rota de chat `/cliente/chat`.

### Cenário: Alternância de abas sem recarregamento
*   **Given** que o cliente está na tela de `/cliente/chat`.
*   **When** o cliente clica na aba "Perfil".
*   **Then** a rota do navegador atualiza para `/cliente/perfil` sem recarregar a página global do portal.
*   **And** exibe a tela de configurações do perfil.

### Cenário: Preservação de bloqueio de telefone não verificado
*   **Given** que o cliente está logado, mas não verificou o seu telefone.
*   **When** ele tenta navegar para `/cliente/chat` ou `/cliente/perfil`.
*   **Then** o middleware de autenticação bloqueia o acesso e o redireciona para `/cliente/verificar-telefone`.
