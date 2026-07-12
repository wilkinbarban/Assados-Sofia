# Apply Progress: Admin Products Drag-and-Drop Ordering

## Status

- Mode: Strict TDD
- Delivery: single PR with maintainer-approved size decision for Medium review budget risk
- Completed: 13/13 tasks
- Remaining: 0/13 tasks
- Next recommended phase: sdd-verify

## Completed Tasks

- [x] 1.1 Update `src/app/atendimento/produtos/page.tsx` to select `ordem_exibicao` and sort admin products by `ordem_exibicao ASC`, using `nome` as a stable tie-breaker.
- [x] 1.2 Extend the `Produto` type in `src/components/operator/ProductCRUD.tsx` to include `ordem_exibicao`.
- [x] 1.3 Align the filtered-visible list model so only the currently rendered admin products participate in reorder logic.
- [x] 2.1 Add `reordenarProdutosVisiveis` in `src/app/actions/produtos.ts` with operator auth/role checks matching existing admin actions.
- [x] 2.2 Validate payload shape with unique IDs, positive integer positions, and submitted IDs only; reject duplicates, gaps in input IDs, and unknown IDs.
- [x] 2.3 Update only the submitted visible product IDs, recomputing `ordem_exibicao` from the provided order, then revalidate `/atendimento/produtos`.
- [x] 3.1 Add drag handles and local reorder state to `ProductCRUD`, using native drag events and preserving the full product list behind the filtered visible slice.
- [x] 3.2 Disable drag-and-drop whenever search or filter text is active, and surface that state in the UI so admins do not confuse filtered ordering with global ordering.
- [x] 3.3 Implement optimistic reorder, pending state, and error rollback so failed saves restore the prior order and show feedback.
- [x] 3.4 Call `reordenarProdutosVisiveis` with the post-drag visible IDs only.
- [x] 4.1 Add unit/component tests for filtered-visible reorder behavior, disabled drag while search/filter text is active, and optimistic rollback on action failure.
- [x] 4.2 Add server-action tests for auth rejection, invalid payloads, duplicate IDs, and updates limited to submitted IDs.
- [x] 4.3 Run the focused build/test verification for the touched admin product path.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `tests/unit/produtos-page-ordering.test.tsx` | Unit | ✅ 11/11 baseline relevant tests passed | ✅ Written first against missing `ordem_exibicao` query behavior | ✅ Passed | ✅ select + two order assertions | ✅ Query kept scoped to admin page |
| 1.2 | `tests/unit/product-ordering.test.ts` | Unit | ✅ 11/11 baseline relevant tests passed | ✅ Written first against missing exported `Produto.ordem_exibicao` helpers | ✅ Passed | ✅ helper fixture requires order values | ✅ Type aligned with page payload |
| 1.3 | `tests/unit/product-ordering.test.ts` | Unit | ✅ 11/11 baseline relevant tests passed | ✅ Written first for visible-only reorder helper | ✅ Passed | ✅ reorder + invalid target cases | ✅ Pure helper extracted |
| 2.1 | `tests/unit/produtos-action.test.ts` | Unit | ✅ 11/11 baseline relevant tests passed | ✅ Written first against missing `reordenarProdutosVisiveis` | ✅ Passed | ✅ admin/supervisor allowed, cliente rejected | ✅ Reused existing permission helper |
| 2.2 | `tests/unit/produtos-action.test.ts` | Unit | ✅ 11/11 baseline relevant tests passed | ✅ Written first for duplicate, non-sequential, and unknown ID rejection | ✅ Passed | ✅ duplicate + gap + unknown ID cases | ✅ Validation helpers extracted |
| 2.3 | `tests/unit/produtos-action.test.ts` | Unit | ✅ 11/11 baseline relevant tests passed | ✅ Written first for submitted-ID-only updates and revalidation | ✅ Passed | ✅ success + rejection paths | ✅ Update loop kept explicit and scoped |
| 3.1 | `tests/components/operator/ProductCRUD.test.tsx` | Integration | ✅ 11/11 baseline relevant tests passed | ✅ Written first for drag handle reorder | ✅ Passed | ✅ rendered order and action payload assertions | ✅ Reorder state isolated from CRUD pending state |
| 3.2 | `tests/unit/product-ordering.test.ts`, `tests/components/operator/ProductCRUD.test.tsx` | Unit/Integration | ✅ 11/11 baseline relevant tests passed | ✅ Written first for disabled search/filter state | ✅ Passed | ✅ search + status filter helper cases | ✅ UI warning centralized from helper |
| 3.3 | `tests/components/operator/ProductCRUD.test.tsx` | Integration | ✅ 11/11 baseline relevant tests passed | ✅ Written first for failed action rollback | ✅ Passed | ✅ success reorder + failure rollback cases | ✅ Rollback uses captured prior state |
| 3.4 | `tests/components/operator/ProductCRUD.test.tsx` | Integration | ✅ 11/11 baseline relevant tests passed | ✅ Written first for post-drag visible payload | ✅ Passed | ✅ payload order assertion includes one-based positions | ✅ Payload builder extracted |
| 4.1 | `tests/unit/product-ordering.test.ts`, `tests/components/operator/ProductCRUD.test.tsx` | Unit/Integration | ✅ 11/11 baseline relevant tests passed | ✅ Test tasks performed before implementation | ✅ Passed | ✅ 7 behavior cases | ✅ Assertions target real UI/helper behavior |
| 4.2 | `tests/unit/produtos-action.test.ts` | Unit | ✅ 11/11 baseline relevant tests passed | ✅ Server-action tests written before action | ✅ Passed | ✅ 5 action cases | ✅ Mock Supabase chain scoped to action contract |
| 4.3 | Verification commands listed below | Verification | ✅ 11/11 baseline relevant tests passed | ✅ Verification targets defined before final check | ✅ Passed | ✅ tests + typecheck + lint + build | ✅ No production refactor needed after green |

## Test Summary

- Total tests written: 13
- Total tests passing: 13 focused tests plus build/typecheck/lint passing
- Layers used: Unit (10), Integration/component (3), E2E (0)
- Approval tests: None — no behavior-preserving refactor tasks
- Pure functions created: 3 (`isProductReorderingDisabled`, `buildVisibleProductOrderPayload`, `reorderProductsByVisibleDrop`)

## Verification Evidence

| Command | Exit Code | Result |
|---------|-----------|--------|
| `npm run test:unit -- tests/unit/admin-actions.test.ts tests/unit/estoque-action.test.ts tests/components/operator/ConversationsQueue.test.tsx` | 0 | Baseline relevant tests: 3 files, 11 tests passed |
| `npm run test:unit -- tests/unit/product-ordering.test.ts tests/unit/produtos-action.test.ts tests/components/operator/ProductCRUD.test.tsx` | 1 | RED evidence: 12 tests failed before implementation because helpers/action/UI did not exist |
| `npm run test:unit -- tests/unit/product-ordering.test.ts tests/unit/produtos-page-ordering.test.tsx tests/unit/produtos-action.test.ts tests/components/operator/ProductCRUD.test.tsx` | 0 | Focused tests: 4 files, 13 tests passed |
| `npx tsc --noEmit --pretty false` | 0 | TypeScript check passed |
| `npx eslint src/app/atendimento/produtos/page.tsx src/components/operator/ProductCRUD.tsx src/app/actions/produtos.ts tests/unit/product-ordering.test.ts tests/unit/produtos-page-ordering.test.tsx tests/unit/produtos-action.test.ts tests/components/operator/ProductCRUD.test.tsx` | 0 | Focused lint passed |
| `npm run build` | 0 | Next production build passed |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/app/atendimento/produtos/page.tsx` | Modified | Admin products query selects `ordem_exibicao` and sorts by manual order before name. |
| `src/components/operator/ProductCRUD.tsx` | Modified | Added order type, pure visible-list reorder helpers, native drag handles, disabled filtered/search state, optimistic save, rollback, and visible-ID-only action call. |
| `src/app/actions/produtos.ts` | Modified | Added `reordenarProdutosVisiveis` with existing operator permission check, Zod validation, duplicate/sequential/unknown ID checks, scoped updates, and admin path revalidation. |
| `tests/unit/product-ordering.test.ts` | Created | Covers visible-only helper behavior, payload construction, and disabled reorder state. |
| `tests/unit/produtos-page-ordering.test.tsx` | Created | Covers admin page ordering query contract. |
| `tests/unit/produtos-action.test.ts` | Created | Covers auth rejection, duplicate/gap/unknown payload rejection, scoped updates, and revalidation. |
| `tests/components/operator/ProductCRUD.test.tsx` | Created | Covers drag payload, disabled search state, and optimistic rollback. |
| `openspec/changes/admin-products-drag-drop-ordering/tasks.md` | Modified | Marked tasks 1.1 through 4.3 complete. |
| `openspec/changes/admin-products-drag-drop-ordering/apply-progress.md` | Created | Recorded cumulative implementation and verification evidence. |

## Deviations from Design

None — implementation matches the OpenSpec design. The UI disables drag-and-drop when search text or the status filter is active per the user's later rule, while still preserving visible-list-only helper semantics.

## Issues / Blockers

None.

## Review Warning Remediation

- Resolved warning: `reordenarProdutosVisiveis` no longer leaves successful earlier product order updates persisted when a later update fails.
- Approach: before updating, the action now reads each submitted product's original `ordem_exibicao`; if any subsequent update fails, it compensates by restoring already-updated rows in reverse order and skips path revalidation.
- Test evidence: `tests/unit/produtos-action.test.ts` covers the second update failing after the first succeeds and asserts the persisted in-memory order is restored.
- Verification:
  - `npm run test:unit -- tests/unit/produtos-action.test.ts tests/unit/product-ordering.test.ts tests/components/operator/ProductCRUD.test.tsx` → exit 0
  - `npm run test:unit -- tests/unit/produtos-page-ordering.test.tsx tests/unit/produtos-action.test.ts tests/unit/product-ordering.test.ts tests/components/operator/ProductCRUD.test.tsx` → exit 0
  - `npx tsc --noEmit --pretty false` → exit 0
