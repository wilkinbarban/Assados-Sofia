# Tasks: Admin Products Inventory Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 320-420 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR: migration/RPC + server action + focused tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add atomic inventory schema/RPC | PR 1 | Migration with `ordem_exibicao`, RPC, grants, rollback-safe SQL checks. |
| 2 | Route admin adjustment through RPC | PR 1 | `src/app/actions/estoque.ts`; preserve response shape and errors. |
| 3 | Prove action/RPC invariants | PR 1 | Vitest plus DB/script verification where available. |

## Phase 1: Database Foundation

- [x] 1.1 Create `supabase/migrations/<timestamp>_admin_products_inventory_hardening.sql` adding `public.produtos.ordem_exibicao INTEGER NOT NULL DEFAULT 0` and optional ordering index.
- [x] 1.2 Add `public.ajustar_estoque_atomico(...)` with row lock, quantity/type validation, controlled-stock non-negative guard, product update, movement insert, and returned quantities.
- [x] 1.3 Revoke broad RPC execute and grant only the required Supabase roles; qualify schema/search path and add comments documenting the security boundary.

## Phase 2: Server Action Integration

- [x] 2.1 Update `src/app/actions/estoque.ts` so `ajustarEstoque` keeps auth/Zod/revalidation but replaces split update+insert writes with `.rpc('ajustar_estoque_atomico', ...)`.
- [x] 2.2 Preserve the existing success shape `{ success: true, data: { qtd_anterior, qtd_nova } }`; optionally include `movimentacao_id` and `produto_ativo` without breaking consumers.
- [x] 2.3 Map RPC/database failures to existing clear errors, including insufficient stock, not found, invalid data, denied access, and generic DB failure.

## Phase 3: Tests and Invariants

- [x] 3.1 Add/adjust Vitest coverage for `src/app/actions/estoque.ts`: RPC parameters, preserved return shape, revalidation, validation failure, and RPC error mapping.
- [x] 3.2 Add DB integration or SQL/script verification for success writing product+movement, insufficient stock writing neither, forced movement failure rollback, and unauthorized role blocking.
- [x] 3.3 Add a schema verification that `public.produtos.ordem_exibicao` exists while no drag-and-drop UI behavior is introduced.

## Phase 4: Verification and Follow-ups

- [x] 4.1 Run focused tests for the action and any DB/RPC verification script; then run the project build/test command configured for this repo.
- [x] 4.2 Document follow-up only: migrate `src/app/actions/pedidos.ts` order confirmation/cancellation to atomic order-stock handling in a separate change.
- [x] 4.3 Document follow-up only: implement drag-and-drop product ordering UI in a separate change after `ordem_exibicao` is available.
