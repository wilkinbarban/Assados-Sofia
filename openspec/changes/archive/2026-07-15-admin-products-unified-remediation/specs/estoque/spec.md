# Delta para estoque

## ADDED Requirements

### Requirement: Ajuste administrativo com ator derivado da sessão

O caminho RPC usado para ajustes administrativos MUST derivar o ator de `auth.uid()` no contexto autenticado. A operação MUST ignorar qualquer identificador de usuário fornecido pelo chamador, rejeitar sessões não autenticadas e preservar as restrições existentes para `admin` e `supervisor`. A atualização do estoque e o registro da movimentação MUST ser atômicos e registrar o ator correto.

#### Scenario: Ajuste autorizado e rastreável

- GIVEN um usuário autenticado com função `admin` ou `supervisor` e um produto existente
- WHEN ele solicita um ajuste válido
- THEN o estoque e a movimentação MUST ser persistidos atomicamente
- AND a movimentação MUST usar como ator o valor derivado de `auth.uid()`

#### Scenario: Identidade fornecida pelo cliente é ignorada

- GIVEN um usuário autorizado autenticado e um identificador de usuário diferente enviado pelo cliente
- WHEN o ajuste é solicitado
- THEN a operação MUST usar somente `auth.uid()` como ator
- AND MUST NOT atribuir a movimentação ao identificador controlado pelo cliente

#### Scenario: Sessão ausente ou função sem permissão

- GIVEN uma sessão ausente ou um usuário que não seja `admin` nem `supervisor`
- WHEN o usuário solicita um ajuste
- THEN a operação MUST ser rejeitada
- AND estoque e movimentações MUST permanecer inalterados

### Requirement: Ciclo de vida compensável de imagens

O sistema MUST usar caminhos versionados para novas imagens. Se a persistência do produto falhar após o upload, MUST remover somente os novos assets dessa tentativa e preservar o estado e a imagem anterior. Após persistência bem-sucedida, assets obsoletos podem ser removidos com segurança. Falhas na limpeza MUST ser observáveis e retriáveis.

#### Scenario: Falha após substituição

- GIVEN um produto com imagem anterior e uma nova imagem processada em caminho versionado
- WHEN a persistência do produto falha após o upload
- THEN o sistema MUST tentar remover somente os assets novos
- AND MUST preservar a imagem anterior e o restante do estado persistido

#### Scenario: Substituição persistida

- GIVEN uma nova imagem e uma persistência do produto concluída com sucesso
- WHEN a substituição é finalizada
- THEN o sistema MUST manter os assets versionados referenciados pelo novo estado
- AND MUST poder remover com segurança os assets obsoletos

#### Scenario: Falha na limpeza

- GIVEN uma limpeza compensatória ou de assets obsoletos que falha
- WHEN a falha é detectada
- THEN o sistema MUST tornar a falha observável
- AND MUST disponibilizar uma condição retriável sem apagar a imagem anterior preservada

### Requirement: Cobertura E2E autenticada do módulo

O sistema MUST possuir cobertura Playwright autenticada para o fluxo administrativo de Produtos/Estoque, incluindo CRUD, filtros, substituição e falha de imagens, regras de reordenação e persistência após recarga.

#### Scenario: Fluxo CRUD e filtros

- GIVEN uma sessão Playwright autenticada como `admin` ou `supervisor`
- WHEN o teste cria, edita, consulta e exclui produtos e aplica filtros
- THEN o comportamento MUST ser verificado na superfície oficial

#### Scenario: Imagem e falha compensável

- GIVEN uma sessão autenticada e um produto com imagem
- WHEN o teste substitui a imagem e exercita uma falha de persistência
- THEN MUST verificar a preservação da imagem anterior e a limpeza dos novos assets

#### Scenario: Reordenação e recarga

- GIVEN uma lista administrativa sem busca e sem filtro de status
- WHEN o teste reordena produtos e recarrega a página
- THEN MUST verificar que a ordem persistida é restaurada
- AND MUST verificar que a reordenação fica desabilitada quando busca ou filtro de status estão ativos

## MODIFIED Requirements

### Requirement: Preparação de Ordenação de Produtos

A tabela `public.produtos` SHALL continuar usando `ordem_exibicao` como fonte de persistência da ordenação manual, e o módulo administrativo SHALL permitir reordenação por drag-and-drop somente na lista completa, sem busca e sem filtros de status. Com busca ou qualquer filtro de status ativo, a reordenação MUST ser desabilitada. A ordem persistida SHALL refletir a sequência global não filtrada. A UI administrativa SHALL reler `ordem_exibicao` ao carregar ou atualizar a lista para preservar a ordem após refresh. Esta mudança MUST NOT alterar a ordenação do catálogo do cliente, exceto quando uma consulta existente já usar `ordem_exibicao` por desenho.

(Previously: A reordenação podia ocorrer dentro da lista atualmente visível/filtrada e recalculava somente o conjunto filtrado.)

#### Scenario: Reordenação global sem filtros

- GIVEN a lista administrativa completa, sem busca e sem filtro de status
- WHEN um admin ou supervisor arrasta um produto para uma nova posição
- THEN o sistema SHALL persistir a sequência global em `produtos.ordem_exibicao`

#### Scenario: Reordenação desabilitada com busca ou filtro

- GIVEN uma busca ou um filtro de status ativo
- WHEN o usuário visualiza a lista ou tenta arrastar um produto
- THEN o controle de drag-and-drop MUST estar desabilitado
- AND nenhum valor de `ordem_exibicao` SHALL ser alterado

#### Scenario: Refresh mantém a ordem salva

- GIVEN uma ordem global já salva via `ordem_exibicao`
- WHEN a lista administrativa é recarregada ou a página é atualizada sem busca ou filtro de status
- THEN os produtos SHALL reaparecer na ordem persistida

#### Scenario: Ordenação do cliente não muda sem caminho compartilhado existente

- GIVEN um usuário em fluxo cliente ou catálogo público
- WHEN a ordem administrativa é alterada
- THEN a experiência cliente MUST NOT mudar por esta funcionalidade
- UNLESS a rota/consulta existente já compartilhe explicitamente a mesma ordenação por desenho

## REMOVED Requirements

## RENAMED Requirements
