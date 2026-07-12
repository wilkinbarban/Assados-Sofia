# Delta para Estoque

## MODIFIED Requirements

### Requirement: 2.8.5 Preparação de Ordenação de Produtos

A tabela `public.produtos` SHALL continuar usando a coluna `ordem_exibicao` como fonte de persistência da ordem manual, e o módulo administrativo SHALL permitir reordenação por drag-and-drop apenas dentro da lista atualmente visível/filtrada. A ordem persistida SHALL refletir somente os produtos presentes no conjunto ativo da tela, sem reordenar itens fora desse conjunto. A UI administrativa SHALL reconsultar `ordem_exibicao` ao carregar ou atualizar a lista, para manter a ordem após refresh. Esta mudança MUST NOT alterar a ordenação do catálogo cliente, exceto se uma consulta existente já usar `ordem_exibicao` por desenho.
(Previously: A coluna de ordenação existia como preparação de schema para ordenação manual futura, sem habilitar interface de drag-and-drop nesta mudança.)

#### Scenario: Reordenação dentro do filtro ativo é persistida

- GIVEN uma lista administrativa filtrada de produtos visível na tela
- WHEN um admin arrasta um produto para uma nova posição dentro dessa lista
- THEN o sistema SHALL persistir a nova sequência em `produtos.ordem_exibicao`
- AND somente os produtos do conjunto filtrado ativo SHALL ter sua ordem recalculada

#### Scenario: Itens fora do filtro ativo não mudam

- GIVEN um filtro administrativo que exibe apenas parte dos produtos
- WHEN o admin reordena os itens visíveis
- THEN produtos fora do filtro ativo MUST NOT ter seus valores de `ordem_exibicao` alterados por essa ação
- AND a reordenação MUST NOT ser tratada como global

#### Scenario: Refresh mantém a ordem salva

- GIVEN uma ordem já salva via `ordem_exibicao`
- WHEN a lista administrativa é recarregada ou a página é atualizada
- THEN os produtos visíveis SHALL reaparecer na ordem persistida
- AND a ordenação SHALL respeitar o contexto filtrado atual

#### Scenario: Ordenação do cliente não muda sem caminho compartilhado existente

- GIVEN um usuário em fluxo cliente ou catálogo público
- WHEN a ordem administrativa é alterada
- THEN a experiência cliente MUST NOT mudar por esta funcionalidade
- UNLESS a rota/consulta já existente compartilha explicitamente a mesma ordenação por projeto
