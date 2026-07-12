<Delta for dashboard_admin>

## ADDED Requirements

### Requirement: Exclusão de Usuários e Clientes (deletarUsuarioAdmin)

A Server Action `deletarUsuarioAdmin` MUST permitir que administradores excluam usuários e clientes do sistema de forma limpa e completa.
1. O sistema MUST impedir que o operador exclua o último perfil de administrador ativo do banco de dados para evitar lockout acidental.
2. A Server Action MUST ser executada sob um contexto seguro utilizando o cliente Supabase com a role de serviço (`service_role`), bypassando as políticas de RLS normais da tabela `public.perfis` e `auth.users`.
3. A operação MUST realizar a deleção em cascata (cascading deletes) em todas as tabelas associadas ao cliente, incluindo pedidos (`public.pedidos` e seus respectivos itens de pedido em `public.itens_pedido`), mensagens (`public.mensagens`), conversas (`public.conversas`) e, por fim, remover o usuário de autenticação correspondente no Supabase Auth (`auth.users`).

#### Scenario: Exclusão de um cliente e seus dados relacionados com sucesso

- GIVEN que o administrador está logado e acessa a área de Gestão de Usuários em `/atendimento/admin`
- AND existe um cliente com ID de usuário correspondente com histórico de pedidos, conversas e mensagens associados
- WHEN o administrador clica no botão para excluir o cliente e confirma a ação no modal
- THEN o sistema invoca a Server Action `deletarUsuarioAdmin`
- AND executa a deleção em cascata contornando as políticas RLS usando `service_role`
- AND remove de forma irreversível os registros em `itens_pedido`, `pedidos`, `mensagens`, `conversas` e do cliente
- AND remove o registro correspondente em `auth.users`
- AND atualiza a listagem de usuários na tela, removendo o cliente.

#### Scenario: Bloqueio da exclusão do último administrador ativo (Prevenção de Lockout)

- GIVEN que o banco de dados contém apenas um usuário ativo com `funcao = 'admin'` e `ativo = true`
- WHEN o administrador tenta excluir este usuário de ID correspondente ao último admin ativo
- THEN a Server Action `deletarUsuarioAdmin` MUST abortar a transação imediatamente
- AND retornar uma mensagem de erro informando que a operação é inválida para evitar lockout
- AND manter o registro correspondente no banco de dados sem nenhuma alteração.

---

### Requirement: Encerramento de Sessão (Logout)

A interface do painel do Dashboard Administrativo `/atendimento/admin` MUST exibir um botão visível para encerramento de sessão (logout).
1. O botão de logout MUST realizar o sign out completo do usuário atual utilizando a biblioteca de cliente do Supabase (`supabase.auth.signOut()`).
2. O sistema MUST assegurar que os cookies de sessão e dados de autenticação armazenados localmente sejam apagados do navegador.
3. Após o logout, o sistema MUST redirecionar automaticamente o usuário para a página de login em `/login`.

#### Scenario: Encerramento de sessão com sucesso

- GIVEN que o administrador está autenticado no painel administrativo `/atendimento/admin`
- WHEN ele clica no botão "Sair" (Logout)
- THEN o sistema invoca a função de sign out do Supabase no cliente
- AND limpa as credenciais locais e cookies de sessão do navegador
- AND redireciona o usuário para a rota `/login`.

---

### Requirement: Gerenciamento Dinâmico de API Keys

Administradores MUST poder visualizar, editar e salvar chaves de API (Meta WhatsApp Cloud API e LLM/OpenRouter) dinamicamente pelo dashboard.
1. As configurações de chaves de API e tokens MUST ser salvas na tabela de configurações do sistema (ex: `public.configuracoes_sistema`).
2. O sistema MUST ler essas chaves em tempo de execução utilizando uma função utilitária com fallback automático para as variáveis de ambiente (`.env`) no servidor caso o registro no banco não esteja presente.
3. Para segurança, as chaves sensíveis (segredos/tokens) MUST ser exibidas de forma mascarada (ex: exibindo apenas caracteres iniciais e asteriscos) na interface do usuário e nunca SHALL ser impressas em texto claro nos logs de auditoria.

#### Scenario: Visualização e atualização de chaves de API pelo administrador

- GIVEN que o administrador está autenticado no painel administrativo na aba "Integrações"
- WHEN ele preenche novos valores para o token da Meta e chave de API do OpenRouter e clica em "Salvar"
- THEN o sistema executa uma Server Action que valida as entradas e as persiste na tabela `public.configuracoes_sistema`
- AND mascara a exibição da chave na interface do usuário após a gravação bem-sucedida
- AND registra a ação na tabela de logs de auditoria sem expor os valores literais das chaves de API.

---

### Requirement: Incorporação da Base de Conhecimento no Dashboard

O painel administrativo em `/atendimento/admin` MUST integrar uma aba dedicada à gestão de artigos da Base de Conhecimento (`KnowledgeCRUD`).
1. A nova aba "Base de Conhecimento" MUST carregar e renderizar o componente de CRUD completo de artigos (previamente standalone).
2. O sistema MUST carregar dinamicamente os artigos da tabela `public.artigos_conhecimento` no carregamento inicial da página e repassar ao componente para visualização.
3. A interface incorporada MUST permitir a realização de todas as operações de criação, leitura, atualização e exclusão (CRUD) de artigos diretamente de dentro do Dashboard Administrativo.

#### Scenario: Gerenciamento de artigos através da aba incorporada no dashboard

- GIVEN que o administrador acessa o Painel Administrativo em `/atendimento/admin`
- WHEN ele seleciona a aba "Base de Conhecimento"
- THEN a interface renderiza a listagem de artigos disponíveis no banco
- AND permite a execução das ações de criação de novo artigo, edição e exclusão dentro do mesmo contêiner visual de dashboard.
