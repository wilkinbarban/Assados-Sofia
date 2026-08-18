# Delta para dashboard_admin

## ADDED Requirements

### Requirement: Superfície oficial de Produtos/Estoque

O sistema MUST oferecer Produtos/Estoque somente dentro de `/atendimento/admin?tab=estoque`. A rota legada `/atendimento/produtos` MUST redirecionar para essa superfície oficial ou deixar de existir, sem manter uma segunda experiência funcional.

#### Scenario: Acesso à aba oficial

- GIVEN um usuário administrativo autenticado com perfil ativo
- WHEN ele acessa `/atendimento/admin?tab=estoque`
- THEN o sistema MUST exibir a experiência integrada de Produtos/Estoque

#### Scenario: Rota legada

- GIVEN qualquer solicitação para `/atendimento/produtos`
- WHEN a rota é resolvida
- THEN o sistema MUST redirecionar para `/atendimento/admin?tab=estoque` ou responder como rota inexistente
- AND MUST NOT oferecer ali uma experiência funcional duplicada

### Requirement: Grade responsiva de produtos

Na aba oficial de Estoque, o sistema MUST renderizar os produtos em cards compactos e responsivos. Em desktop, a grade MUST suportar até seis colunas; em telas menores, MUST adaptar a quantidade de colunas ao espaço disponível sem perder a operação dos cards.

#### Scenario: Grade desktop

- GIVEN a aba de Estoque aberta em uma viewport desktop
- WHEN os produtos são carregados
- THEN os cards MUST ser exibidos em uma grade compacta com no máximo seis colunas

#### Scenario: Grade responsiva

- GIVEN a aba de Estoque aberta em uma viewport menor
- WHEN os produtos são carregados
- THEN os cards MUST se reorganizar responsivamente
- AND cada ação administrativa MUST continuar acessível

### Requirement: Restrições administrativas existentes

O acesso à superfície oficial MUST preservar as restrições existentes do painel: somente usuários autenticados com função `admin` ou `supervisor` e perfil ativo podem utilizá-la; usuários não autenticados, inativos ou com outras funções MUST ser bloqueados conforme as regras existentes de `/atendimento/admin`.

#### Scenario: Usuário autorizado

- GIVEN um usuário autenticado com `funcao = 'admin'` ou `funcao = 'supervisor'` e `ativo = true`
- WHEN ele acessa a aba de Estoque
- THEN o sistema MUST permitir o uso da superfície oficial

#### Scenario: Usuário não autorizado

- GIVEN uma sessão ausente, um perfil inativo ou uma função diferente de `admin` e `supervisor`
- WHEN o usuário tenta acessar a aba de Estoque
- THEN o sistema MUST negar o acesso usando o comportamento já definido para o painel administrativo

## MODIFIED Requirements

## REMOVED Requirements

## RENAMED Requirements
