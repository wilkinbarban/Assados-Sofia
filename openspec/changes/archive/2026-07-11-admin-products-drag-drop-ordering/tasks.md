# Tasks: Admin Products Drag-and-Drop Ordering

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 220-330 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Admin query + server action + UI wiring | PR 1 | Single slice; includes tests and build check |

## Phase 1: Data Loading and Contract

- [x] 1.1 Update `src/app/atendimento/produtos/page.tsx` to select `ordem_exibicao` and sort admin products by `ordem_exibicao ASC`, using `nome` as a stable tie-breaker.
- [x] 1.2 Extend the `Produto` type in `src/components/operator/ProductCRUD.tsx` to include `ordem_exibicao`.
- [x] 1.3 Align the filtered-visible list model so only the currently rendered admin products participate in reorder logic.

## Phase 2: Server Action

- [x] 2.1 Add `reordenarProdutosVisiveis` in `src/app/actions/produtos.ts` with operator auth/role checks matching existing admin actions.
- [x] 2.2 Validate payload shape with unique IDs, positive integer positions, and submitted IDs only; reject duplicates, gaps in input IDs, and unknown IDs.
- [x] 2.3 Update only the submitted visible product IDs, recomputing `ordem_exibicao` from the provided order, then revalidate `/atendimento/produtos`.

## Phase 3: ProductCRUD Interaction

- [x] 3.1 Add drag handles and local reorder state to `ProductCRUD`, using native drag events and preserving the full product list behind the filtered visible slice.
- [x] 3.2 Disable drag-and-drop whenever search or filter text is active, and surface that state in the UI so admins do not confuse filtered ordering with global ordering.
- [x] 3.3 Implement optimistic reorder, pending state, and error rollback so failed saves restore the prior order and show feedback.
- [x] 3.4 Call `reordenarProdutosVisiveis` with the post-drag visible IDs only.

## Phase 4: Tests and Verification

- [x] 4.1 Add unit/component tests for filtered-visible reorder behavior, disabled drag while search/filter text is active, and optimistic rollback on action failure.
- [x] 4.2 Add server-action tests for auth rejection, invalid payloads, duplicate IDs, and updates limited to submitted IDs.
- [x] 4.3 Run the focused build/test verification for the touched admin product path.
