# Especificação: Módulo Estoque

Este documento define as especificações de negócio, comportamento do sistema e requisitos técnicos para o módulo de Estoque e Gestão de Produtos.

**Origem:** `estoque-horarios` (arquivado em 2026-07-07)

---

## 1. Visão Geral

O módulo estende o sistema de catálogo de produtos existente com controle de estoque, movimentações auditadas, upload de imagens processadas e integração com a IA Sofía para consulta de produtos e disponibilidade.

---

## 2. Requisitos de Negócio e Funcionais

### 2.1. Extensão da Tabela `produtos` (Spec E1)

#### 2.1.1. Novas Colunas
A tabela `public.produtos` SHALL ser estendida com as seguintes colunas:
- `quantidade_estoque`: `INTEGER` (NOT NULL, DEFAULT 0, CHECK >= 0)
- `estoque_minimo`: `INTEGER` (NOT NULL, DEFAULT 5, CHECK >= 0)
- `controlar_estoque`: `BOOLEAN` (NOT NULL, DEFAULT TRUE)
- `url_imagem_thumb`: `TEXT` (NULLABLE) — thumbnail 300px
- `url_imagem_2`: `TEXT` (NULLABLE) — segunda foto full
- `url_imagem_2_thumb`: `TEXT` (NULLABLE) — segunda foto thumbnail

A migração MUST usar DEFAULTs não-nulos para não quebrar dados existentes.

#### 2.1.2. Lógica de Ativação
- `ativo = false` → produto não disponível (esgotado ou desabilitado manualmente).
- `ativo = true AND quantidade_estoque > 0` → disponível para venda.
- `ativo = true AND quantidade_estoque = 0 AND controlar_estoque = TRUE` → automaticamente desabilitado (`ativo = FALSE`).

---

### 2.2. CRUD de Produtos com Estoque (Spec E2)

#### 2.2.1. Operações
- **Criar**: nome (obrigatório), descrição, preço (obrigatório, centavos), quantidade inicial, estoque mínimo.
- **Editar**: todos os campos editáveis.
- **Excluir**: cascade — remove fotos do bucket, movimentações, atualiza itens de pedidos associados (FK ON DELETE RESTRICT em itens_pedido; validar antes de excluir).
- **Toggle**: ativar/desativar produto manualmente.

#### 2.2.2. Validação
Todas as operações MUST usar validação zod. O preço SHALL ser armazenado em centavos (INTEGER).

---

### 2.3. Upload de Imagens (Spec E3)

#### 2.3.1. Validação de Entrada
- Tipos aceitos: JPEG, PNG, WebP (validar MIME type + extensão).
- Tamanho máximo: 10MB por arquivo.
- Máximo 2 fotos por produto.

#### 2.3.2. Processamento com `sharp`
O sistema MUST processar cada imagem gerando:
- Thumbnail: 300px largura, qualidade 80%, WebP.
- Full: 800px largura, qualidade 85%, WebP.
- Nomenclatura: `prod_{id}_thumb.webp` / `prod_{id}_full.webp` (foto 1) e `prod_{id}_2_thumb.webp` / `prod_{id}_2_full.webp` (foto 2).

#### 2.3.3. Armazenamento
- Upload para bucket `produto-imagens` (privado) no Supabase Storage.
- Leitura pública com RLS policies específicas para o bucket.
- Ao remover produto ou trocar imagem, excluir arquivos correspondentes do bucket.

#### 2.3.4. UX
Preview na UI antes de salvar, com drag & drop e indicador de progresso.

---

### 2.4. Movimentações de Estoque (Spec E4)

#### 2.4.1. Modelo `public.movimentacoes_estoque`
- `id`: `UUID` (PRIMARY KEY)
- `produto_id`: `UUID` (NOT NULL, FK → produtos, ON DELETE CASCADE)
- `tipo`: `tipo_movimentacao` ENUM ('entrada', 'saida', 'ajuste', 'cancelamento')
- `quantidade`: `INTEGER` (NOT NULL)
- `quantidade_anterior`: `INTEGER` (NOT NULL)
- `quantidade_nova`: `INTEGER` (NOT NULL)
- `motivo`: `TEXT` (NULLABLE)
- `usuario_id`: `UUID` (FK → auth.users)
- `pedido_id`: `UUID` (FK → pedidos, ON DELETE SET NULL)
- `data_criacao`: `TIMESTAMPTZ` (default `now()`)

#### 2.4.2. Rastreabilidade
Toda alteração de quantidade MUST gerar um registro nesta tabela. O histórico SHALL ser visível na UI por produto.

#### 2.4.3. RLS
- Leitura e inserção restritas a usuários autenticados com roles `admin`, `supervisor` ou `vendedor`.

---

### 2.5. Integração com Vendas (Spec E5)

#### 2.5.1. Confirmação de Pedido
Ao confirmar pedido (`status = 'confirmado'`):
- Para cada item do pedido com `controlar_estoque = TRUE`:
  - Calcular `nova_quantidade = quantidade_estoque - item.quantidade`.
  - Registrar `movimentacoes_estoque` tipo 'saida' com `pedido_id`.
  - Se `nova_quantidade <= 0` → `ativo = FALSE`.
  - Atualizar `produto.quantidade_estoque`.

#### 2.5.2. Cancelamento de Pedido
Ao cancelar pedido:
- Para cada item do pedido com `controlar_estoque = TRUE`:
  - Restaurar `quantidade_estoque` (adicionar de volta).
  - Registrar `movimentacoes_estoque` tipo 'cancelamento'.
  - Se `quantidade_estoque > 0` → `ativo = TRUE`.

---

### 2.6. Integração com Sofía (Spec E6)

#### 2.6.1. RPCs de Produtos
- `buscar_produtos_disponiveis()`: retorna produtos ativos com estoque > 0 (ou `controlar_estoque = FALSE`), ordenados por nome. Função SECURITY DEFINER.
- `buscar_produto_por_nome(nome TEXT)`: busca textual ILIKE, limitado a 5 resultados. Função SECURITY DEFINER.

#### 2.6.2. Capacidades da Sofía
- Listar cardápio completo com preços.
- Informar preço de um produto específico.
- Verificar disponibilidade de produtos.
- Sugerir ofertas e complementos de forma natural.
- Informar "indisponível temporariamente" para produtos desabilitados.

#### 2.6.3. Restrição Crítica
Sofía NUNCA SHALL confirmar pedido automaticamente. Deve sempre perguntar ao operador antes de qualquer confirmação. Esta regra é injetada no system prompt do RAG.

#### 2.6.4. Pipeline RAG
As RPCs de produtos SHALL ser chamadas no `processarRagPipeline` para injetar informações de produtos no contexto de suporte do system prompt. A intenção de cardápio/produto/preço na mensagem do cliente deve ser detectada para acionar a consulta.

---

### 2.7. UI do Dashboard (Spec E7)

#### 2.7.1. Aba "Estoque"
Nova aba no `AdminDashboard` com os seguintes elementos:
- Tabela de produtos: nome, preço (formatado R$), estoque (com indicador de cor: verde/amarelo/vermelho), status (badge), ações (editar/excluir).
- Botão "+ Novo Produto" → abre modal de criação.

#### 2.7.2. Modal Criar/Editar
- Campos: nome*, descrição, preço*, quantidade inicial, estoque mínimo.
- Upload de imagem: drag & drop, preview, validação, indicador de progresso.
- Toggle "Controlar estoque".

#### 2.7.3. Funcionalidades Auxiliares
- Botões +/- na coluna de estoque para ajuste rápido.
- Filtros: Todos / Ativos / Esgotados.
- Tabela de histórico de movimentações abaixo da tabela principal, com paginação simples.

---

### 2.8. Ajuste Administrativo Atômico e Ordenação Futura

#### 2.8.1. Ajuste Atômico de Estoque
O sistema MUST executar ajustes administrativos de estoque por um único caminho transacional, via RPC Postgres/Supabase ou mecanismo equivalente, no qual atualização de `produtos.quantidade_estoque` e inserção em `movimentacoes_estoque` sejam indivisíveis.

##### Scenario: Ajuste registra estoque e movimentação juntos
- GIVEN um usuário admin ou supervisor autenticado e um produto existente
- WHEN o estoque é ajustado por entrada, saída, ajuste ou cancelamento válido
- THEN `produtos.quantidade_estoque` SHALL refletir a nova quantidade
- AND uma linha correspondente SHALL existir em `movimentacoes_estoque`
- AND ambos os efeitos SHALL pertencer à mesma transação lógica

##### Scenario: Falha no registro reverte o estoque
- GIVEN uma falha ao inserir `movimentacoes_estoque`
- WHEN um ajuste de estoque é solicitado
- THEN `produtos.quantidade_estoque` MUST permanecer inalterado
- AND nenhuma movimentação parcial SHALL ser persistida

#### 2.8.2. Proteção contra Estoque Insuficiente
O sistema MUST rejeitar saídas que deixariam estoque controlado abaixo de zero e MUST NOT persistir alterações parciais nesse caso.

##### Scenario: Saída maior que estoque disponível é rejeitada
- GIVEN um produto com `controlar_estoque = TRUE` e quantidade disponível menor que a saída solicitada
- WHEN o ajuste de saída é solicitado
- THEN a operação MUST falhar com erro claro de estoque insuficiente
- AND `produtos.quantidade_estoque` SHALL permanecer inalterado
- AND nenhuma linha em `movimentacoes_estoque` SHALL ser criada

#### 2.8.3. Permissões para Ajuste Administrativo
O sistema MUST permitir ajustes administrativos de estoque somente para usuários autenticados com papel `admin` ou `supervisor`.

##### Scenario: Admin ou supervisor ajusta estoque
- GIVEN um usuário autenticado com papel `admin` ou `supervisor`
- WHEN solicita um ajuste válido de estoque
- THEN a operação SHALL ser autorizada

##### Scenario: Papel sem permissão é bloqueado
- GIVEN um usuário autenticado sem papel `admin` ou `supervisor`, ou uma sessão ausente
- WHEN solicita um ajuste de estoque
- THEN a operação MUST ser negada
- AND estoque e movimentações MUST permanecer inalterados

#### 2.8.4. Verificação Crítica de Invariantes de Estoque
A mudança MUST incluir testes ou verificações automatizadas que provem sucesso transacional, falha por estoque insuficiente, rollback em falha de log e autorização.

##### Scenario: Suíte cobre caminhos críticos
- GIVEN a implementação do ajuste transacional
- WHEN os testes de estoque são executados
- THEN eles SHALL verificar sucesso com movimentação, insuficiência sem escrita parcial, rollback em falha de log e bloqueio por permissão

#### 2.8.5. Preparação de Ordenação de Produtos
A tabela `public.produtos` SHALL continuar usando `ordem_exibicao` como fonte de persistência da ordenação manual, e o módulo administrativo SHALL permitir reordenação por drag-and-drop somente dentro da lista atualmente visível/filtrada. A ordem persistida SHALL refletir apenas os produtos presentes no conjunto ativo da tela, sem reordenar itens fora desse conjunto. A UI administrativa SHALL reler `ordem_exibicao` ao carregar ou atualizar a lista para preservar a ordem após refresh. Esta mudança MUST NOT alterar a ordenação do catálogo do cliente, exceto quando uma consulta existente já usar `ordem_exibicao` por desenho.
(Previously: A coluna de ordenação existia como preparação de schema para ordenação manual futura, sem habilitar interface de drag-and-drop nesta mudança.)

##### Scenario: Reordenação dentro do filtro ativo é persistida
- GIVEN uma lista administrativa de produtos filtrada e visível na tela
- WHEN um admin arrasta um produto para uma nova posição dentro dessa lista
- THEN o sistema SHALL persistir a nova sequência em `produtos.ordem_exibicao`
- AND somente os produtos do conjunto filtrado ativo SHALL ter sua ordem recalculada

##### Scenario: Itens fora do filtro ativo não mudam
- GIVEN um filtro administrativo que exibe apenas parte dos produtos
- WHEN o admin reordena os itens visíveis
- THEN produtos fora do filtro ativo MUST NOT ter seus valores de `ordem_exibicao` alterados por essa ação
- AND a reordenação MUST NOT ser tratada como global

##### Scenario: Refresh mantém a ordem salva
- GIVEN uma ordem já salva via `ordem_exibicao`
- WHEN a lista administrativa é recarregada ou a página é atualizada
- THEN os produtos visíveis SHALL reaparecer na ordem persistida
- AND a ordenação SHALL respeitar o contexto filtrado atual

##### Scenario: Ordenação do cliente não muda sem caminho compartilhado existente
- GIVEN um usuário em fluxo cliente ou catálogo público
- WHEN a ordem administrativa é alterada
- THEN a experiência cliente MUST NOT mudar por esta funcionalidade
- UNLESS a rota/consulta existente já compartilhe explicitamente a mesma ordenação por desenho
