# Delta for Estoque

## ADDED Requirements

### Requirement: Ajuste Atômico de Estoque

O sistema MUST executar ajustes administrativos de estoque por um único caminho transacional, via RPC Postgres/Supabase ou mecanismo equivalente, no qual atualização de `produtos.quantidade_estoque` e inserção em `movimentacoes_estoque` sejam indivisíveis.

#### Scenario: Ajuste registra estoque e movimentação juntos

- GIVEN um usuário admin ou supervisor autenticado e um produto existente
- WHEN o estoque é ajustado por entrada, saída, ajuste ou cancelamento válido
- THEN `produtos.quantidade_estoque` SHALL refletir a nova quantidade
- AND uma linha correspondente SHALL existir em `movimentacoes_estoque`
- AND ambos os efeitos SHALL pertencer à mesma transação lógica

#### Scenario: Falha no registro reverte o estoque

- GIVEN uma falha ao inserir `movimentacoes_estoque`
- WHEN um ajuste de estoque é solicitado
- THEN `produtos.quantidade_estoque` MUST permanecer inalterado
- AND nenhuma movimentação parcial SHALL ser persistida

### Requirement: Proteção contra Estoque Insuficiente

O sistema MUST rejeitar saídas que deixariam estoque controlado abaixo de zero e MUST NOT persistir alterações parciais nesse caso.

#### Scenario: Saída maior que estoque disponível é rejeitada

- GIVEN um produto com `controlar_estoque = TRUE` e quantidade disponível menor que a saída solicitada
- WHEN o ajuste de saída é solicitado
- THEN a operação MUST falhar com erro claro de estoque insuficiente
- AND `produtos.quantidade_estoque` SHALL permanecer inalterado
- AND nenhuma linha em `movimentacoes_estoque` SHALL ser criada

### Requirement: Permissões para Ajuste Administrativo

O sistema MUST permitir ajustes administrativos de estoque somente para usuários autenticados com papel `admin` ou `supervisor`.

#### Scenario: Admin ou supervisor ajusta estoque

- GIVEN um usuário autenticado com papel `admin` ou `supervisor`
- WHEN solicita um ajuste válido de estoque
- THEN a operação SHALL ser autorizada

#### Scenario: Papel sem permissão é bloqueado

- GIVEN um usuário autenticado sem papel `admin` ou `supervisor`, ou uma sessão ausente
- WHEN solicita um ajuste de estoque
- THEN a operação MUST ser negada
- AND estoque e movimentações MUST permanecer inalterados

### Requirement: Verificação Crítica de Invariantes de Estoque

A mudança MUST incluir testes ou verificações automatizadas que provem sucesso transacional, falha por estoque insuficiente, rollback em falha de log e autorização.

#### Scenario: Suíte cobre caminhos críticos

- GIVEN a implementação do ajuste transacional
- WHEN os testes de estoque são executados
- THEN eles SHALL verificar sucesso com movimentação, insuficiência sem escrita parcial, rollback em falha de log e bloqueio por permissão

### Requirement: Preparação de Ordenação de Produtos

A tabela `public.produtos` SHALL incluir a coluna `ordem_exibicao` como preparação de schema para ordenação manual futura, sem habilitar interface de drag-and-drop nesta mudança.

#### Scenario: Coluna de ordenação existe sem UI de reordenação

- GIVEN a migração desta mudança aplicada
- WHEN o schema de `public.produtos` é inspecionado
- THEN a coluna `ordem_exibicao` SHALL existir
- AND nenhuma UI de drag-and-drop SHALL ser adicionada por esta mudança
