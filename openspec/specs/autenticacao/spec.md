# Especificação de Requisitos: Autenticação e Perfis (autenticacao)

**ID da Mudança:** `epica1-auth-otp`  
**Domínio:** `autenticacao`  
**Status:** `Aprovado`  

---

## 1. Descrição Executiva
Este documento especifica os requisitos de autenticação para o portal web da churrascaria **Asados**. Define os fluxos de criação de conta (registro), validação de e-mail via Supabase Auth, controle de sessões, login de operadores (Admin, Supervisor, Vendedor) e proteção de rotas com base no papel (`tipo_funcao`) definido na tabela `perfis`.

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Registro e Criação de Perfis
*   **REQ-AUTH-001**: O sistema MUST permitir que novos clientes se registrem no portal web fornecendo `e-mail`, `senha` e `nome`.
*   **REQ-AUTH-002**: Toda nova conta criada via portal web MUST ser inicializada com o status pendente de confirmação de e-mail e vinculada a um perfil na tabela `perfis` com a coluna `funcao` configurada como `'cliente'` por padrão.
*   **REQ-AUTH-003**: A senha fornecida pelo usuário no registro MUST possuir no mínimo 8 caracteres, contendo pelo menos uma letra maiúscula, uma letra minúscula e um número.
*   **REQ-AUTH-004**: O endereço de e-mail digitado MUST ser validado sintaticamente no cliente e no servidor usando a especificação RFC 5322.

### 2.2 Confirmação de E-mail
*   **REQ-AUTH-005**: O Supabase Auth MUST disparar automaticamente um e-mail de confirmação contendo um link/token de validação ao registrar uma conta.
*   **REQ-AUTH-006**: O usuário SHALL NOT conseguir realizar login ou acessar o portal do cliente enquanto não confirmar o seu e-mail através do link recebido.

### 2.3 Sessão e Login
*   **REQ-AUTH-007**: A autenticação do usuário MUST ser gerida via Supabase Auth.
*   **REQ-AUTH-008**: O token JWT de sessão gerado pelo Supabase Auth MUST ser sincronizado com os cookies HTTP do navegador (usando `@supabase/ssr` e cookies seguros `HttpOnly`, `Secure`, `SameSite=Lax`) para permitir autenticação em Server Components, Server Actions e API Routes.
*   **REQ-AUTH-009**: O tempo de expiração da sessão ativa do usuário SHOULD seguir o padrão padrão de 1 hora, exigindo renovação automática via Refresh Token em segundo plano.

### 2.4 Login de Operadores e Controle de Acesso
*   **REQ-AUTH-010**: Operadores do sistema (papéis `'admin'`, `'supervisor'` e `'vendedor'`) MUST efetuar login utilizando o mesmo fluxo centralizado de e-mail e senha.
*   **REQ-AUTH-011**: O middleware do Next.js MUST inspecionar a função (`funcao`) do usuário autenticado no banco de dados (tabela `perfis`) antes de conceder acesso a rotas restritas.
*   **REQ-AUTH-012**: Rotas que iniciam com `/admin` MUST ser restritas a usuários com papel `'admin'`.
*   **REQ-AUTH-013**: Rotas que iniciam com `/atendimento` ou `/dashboard` MUST ser restritas a operadores com papéis `'admin'`, `'supervisor'` ou `'vendedor'`.
*   **REQ-AUTH-014**: Se um usuário não autenticado ou sem permissões tentar acessar uma rota protegida, o sistema MUST redirecioná-lo para a tela de login (`/login`) ou retornar erro de acesso negado (`403 Forbidden`).
*   **REQ-AUTH-015**: O perfil do usuário logado MUST ter a propriedade `ativo = true` para permitir o login e acesso ao sistema. Se `ativo = false`, a tentativa de login MUST ser bloqueada retornando mensagem informativa amigável.

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Registro com sucesso de novo cliente web
*   **Given** que o usuário está na página de registro `/cadastro` do portal web.
*   **When** o usuário preenche o nome "Wilkin da Silva", e-mail "cliente.wilkin@gmail.com", digita uma senha válida "AsadosCuritiba41!" e clica no botão "Criar Conta".
*   **Then** o sistema cria o usuário no Supabase Auth com status inativo (e-mail não verificado).
*   **And** o sistema insere um registro correspondente na tabela `perfis` com `nome` = "Wilkin da Silva", `funcao` = 'cliente' e `ativo` = true.
*   **And** exibe uma mensagem de sucesso solicitando que o usuário confirme o e-mail em sua caixa de entrada.
*   **And** dispara um e-mail de confirmação para o endereço fornecido.

### Cenário 2: Registro falha devido a formato de e-mail inválido
*   **Given** que o usuário está na página de registro `/cadastro`.
*   **When** o usuário insere um e-mail sem formato válido, como "wilkin_invalido@com", preenche o restante dos campos e tenta enviar.
*   **Then** o formulário impede o envio do payload.
*   **And** exibe uma mensagem de erro na interface dizendo "Formato de e-mail inválido".
*   **And** nenhum registro é criado no Supabase Auth ou na tabela `perfis`.

### Cenário 3: Confirmação de e-mail via link de validação
*   **Given** que o usuário "cliente.wilkin@gmail.com" recebeu o e-mail de confirmação do Supabase.
*   **When** o usuário clica no link de confirmação contido no e-mail.
*   **Then** a API do Supabase atualiza a coluna `email_confirmed_at` na tabela interna `auth.users` para a data/hora atual.
*   **And** redireciona o usuário para a página de login `/login` com uma mensagem de confirmação bem-sucedida.

### Cenário 4: Login bem-sucedido de cliente com e-mail confirmado
*   **Given** que o usuário "cliente.wilkin@gmail.com" tem sua conta criada e e-mail confirmado.
*   **When** o usuário navega até `/login`, preenche suas credenciais corretas e clica em "Entrar".
*   **Then** o sistema gera um token JWT de sessão válido.
*   **And** salva a sessão em cookies HTTP criptografados.
*   **And** redireciona o usuário para o fluxo de verificação de telefone (se não verificado) ou para o portal principal.

### Cenário 5: Tentativa de login de cliente com e-mail não confirmado
*   **Given** que o usuário "cliente.não-confirmado@gmail.com" se cadastrou, mas não clicou no link de e-mail.
*   **When** o usuário tenta efetuar login em `/login` com suas credenciais corretas.
*   **Then** o sistema recusa a autenticação.
*   **And** exibe a mensagem de erro: "Por favor, confirme seu e-mail antes de efetuar o login".

### Cenário 6: Login de Operador e redirecionamento correto
*   **Given** que um operador do sistema possui um perfil cadastrado com e-mail "admin.asados@gmail.com" e `funcao` = 'admin'.
*   **When** o operador realiza login com sucesso in `/login`.
*   **Then** o sistema identifica seu papel e o redireciona automaticamente para o painel de administração `/admin`.

### Cenário 7: Bloqueio de rota restrita para cliente comum
*   **Given** que o usuário está autenticado com papel `funcao` = 'cliente'.
*   **When** ele tenta navegar diretamente pela URL para a rota `/admin/prompts`.
*   **Then** o middleware do Next.js intercepta a requisição.
*   **And** redireciona o usuário para a página de erro ou de acesso negado `/403` com um alerta de permissão insuficiente.

### Cenário 8: Bloqueio de login de operador desativado
*   **Given** que o operador com e-mail "vendedor.antigo@gmail.com" e `funcao` = 'vendedor' possui `ativo` = false na tabela `perfis`.
*   **When** ele tenta efetuar login in `/login`.
*   **Then** o sistema recusa o acesso.
*   **And** exibe a mensagem: "Sua conta está desativada. Entre em contato com o administrador".

---

## 4. Estrutura de Validação de Dados (Schema Zod)
Para o registro e login, a validação MUST impor as seguintes regras:
```typescript
// Apenas representação de validação conceitual (Sem código no spec, apenas diretrizes de esquema)
// - Email: obrigatório, formato string em e-mail válido.
// - Senha: obrigatório, string de no mínimo 8 caracteres, validando complexidade de caracteres.
// - Nome: obrigatório, string de no mínimo 3 caracteres, sem caracteres especiais abusivos.
```
