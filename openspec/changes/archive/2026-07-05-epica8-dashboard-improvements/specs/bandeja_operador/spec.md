<Delta for bandeja_operador>

## ADDED Requirements

### Requirement: Atalho de Retorno ao Painel Administrativo

O espaço de trabalho da fila de atendimento (chat do operador) em `/atendimento` MUST exibir um link ou botão de retorno ao painel administrativo.
1. O atalho para o painel administrativo em `/atendimento/admin` MUST ser exibido na interface apenas se o papel (`funcao`) do perfil do operador autenticado for `'admin'` ou `'supervisor'`.
2. Se o papel (`funcao`) do perfil do operador autenticado for `'vendedor'` ou `'cliente'`, o link/botão para `/atendimento/admin` SHALL NOT ser renderizado na interface.

#### Scenario: Visualização do atalho de retorno para operador com perfil de administrador ou supervisor

- GIVEN que o usuário está autenticado e acessa a fila de chat em `/atendimento`
- AND o perfil do usuário possui a função `funcao = 'admin'` ou `funcao = 'supervisor'`
- WHEN a interface da fila de chat é renderizada
- THEN o sistema exibe o link de atalho rotulado como "Painel Administrativo"
- AND clicar neste atalho direciona o usuário com sucesso para a rota `/atendimento/admin`.

#### Scenario: Ocultação do atalho de retorno para operador com perfil de vendedor

- GIVEN que o usuário está autenticado e acessa a fila de chat em `/atendimento`
- AND o perfil do usuário possui a função `funcao = 'vendedor'`
- WHEN a interface da fila de chat é renderizada
- THEN o sistema oculta e não renderiza o link de atalho para o painel administrativo `/atendimento/admin`.
