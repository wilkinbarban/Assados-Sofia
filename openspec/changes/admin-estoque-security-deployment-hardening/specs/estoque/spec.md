# Delta for estoque

## MODIFIED Requirements

### Requirement: CRUD de Produtos com Estoque (Spec E2)

Generic updates SHALL NOT write `quantidade_estoque`. Positive initial quantity SHALL use the controlled writer and create an `entrada` movement with reason `Estoque inicial`. Deletion SHALL preserve referenced data and report image-cleanup failures without claiming success.

(Previously: Generic edits included stock and deletion assumed cascading image removal.)

#### Scenario: Product created with initial stock
- GIVEN an authorized actor creates a product with positive stock
- WHEN creation commits
- THEN stock and one `entrada`/`Estoque inicial` movement SHALL commit atomically

#### Scenario: Generic stock edit is denied
- GIVEN any caller submits stock through a generic product edit
- WHEN the update is evaluated
- THEN stock and movement history SHALL remain unchanged

#### Scenario: Product or image deletion fails safely
- GIVEN references block deletion or Storage cleanup fails
- WHEN deletion is requested
- THEN referenced product data SHALL remain consistent
- AND failure SHALL be observable/retriable

### Requirement: Ajuste administrativo com ator derivado da sessão

Every stock change SHALL use a transactional writer deriving `auth.uid()`, locking stock, preventing negative controlled stock, and atomically updating stock, active state, and one movement. Only active `admin` or `supervisor` users SHALL adjust stock; order transitions SHALL use authorized writers.

(Previously: Only authenticated administrative adjustment was covered.)

#### Scenario: Concurrent writers serialize
- GIVEN concurrent requests target the same controlled stock
- WHEN both transactions execute
- THEN each SHALL evaluate committed stock
- AND stock SHALL equal the ordered movement sequence

#### Scenario: Insufficient stock rolls back
- GIVEN controlled stock is below requested output
- WHEN the writer executes
- THEN it SHALL reject without stock, active-state, or movement change

#### Scenario: Movement failure rolls back
- GIVEN stock can change but movement persistence fails
- WHEN the transaction completes
- THEN no stock or active-state effect SHALL persist

### Requirement: Preparação de Ordenação de Produtos

`ordem_exibicao` SHALL order admin, client catalog, Sofia/RAG, and order selectors. Unsearched results SHALL use official order then stable fallback. Search SHALL use relevance, official order, then fallback. New products SHALL receive a deterministic position without reordering existing products. Admin reorder SHALL remain disabled under search or status filters.

(Previously: Official order was administrative and excluded unshared client ordering.)

#### Scenario: All consumers use official order
- GIVEN products have distinct `ordem_exibicao` values
- WHEN a named consumer lists without search
- THEN it SHALL return the same official sequence

#### Scenario: Search preserves relevance priority
- GIVEN search produces unequal and tied relevance
- WHEN results are returned
- THEN relevance SHALL rank first
- AND ties SHALL use official order then deterministic fallback

#### Scenario: Missing order and new product are deterministic
- GIVEN a product lacks order or is newly created
- WHEN the list is loaded repeatedly
- THEN its position SHALL be stable without reshuffling existing products

#### Scenario: Filtered admin reorder is denied
- GIVEN search or a status filter is active
- WHEN reorder is attempted
- THEN no `ordem_exibicao` value SHALL change

### Requirement: Cobertura E2E autenticada do módulo

Mutable browser tests SHALL run only locally or disposably; production smoke SHALL be read-only. Evidence SHALL cover admin/supervisor success, `vendedor` denial, `Esgotados`, movements, official order, six-column desktop geometry, badge semantics, and visible failures.

(Previously: E2E lacked environment and complete role/UI evidence.)

#### Scenario: Authorized stock UI evidence
- GIVEN local active admin and supervisor sessions
- WHEN stock flows and `Esgotados` execute
- THEN movements, badges, and order SHALL match persisted state

#### Scenario: Desktop geometry and denial
- GIVEN desktop and a `vendedor` session
- WHEN the stock surface is inspected
- THEN authorized views SHALL show six columns and seller SHALL receive no administrative data

#### Scenario: Production evidence is read-only
- GIVEN hosted production
- WHEN smoke executes
- THEN it SHALL create, edit, reorder, approve, or delete nothing
