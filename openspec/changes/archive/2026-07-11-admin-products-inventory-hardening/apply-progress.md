# Apply Progress — admin-products-inventory-hardening

## Status

Partial apply completed for Slice A / Phase 1: Database Foundation.

## Completed Tasks

- [x] 1.1 Created `supabase/migrations/20260711144706_admin_products_inventory_hardening.sql` adding `public.produtos.ordem_exibicao INTEGER NOT NULL DEFAULT 0` and index `idx_produtos_ordem_exibicao`.
- [x] 1.2 Added `public.ajustar_estoque_atomico(...)` with row lock, validation, non-negative stock guard, product update, movement insert, and return columns `qtd_anterior`, `qtd_nova`, `movimentacao_id`, and `produto_ativo`.
- [x] 1.3 Added explicit `search_path`, function comment, `REVOKE` from `public`, and `GRANT EXECUTE` to `authenticated` and `service_role`.

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/20260711144706_admin_products_inventory_hardening.sql` | Created | Adds schema prep and atomic stock RPC. |
| `openspec/changes/admin-products-inventory-hardening/tasks.md` | Updated | Marks Phase 1 tasks complete. |
| `openspec/changes/admin-products-inventory-hardening/apply-progress.md` | Created | Records cumulative apply progress. |

## Verification Performed

- Confirmed the migration file exists and contains `ordem_exibicao`, `ajustar_estoque_atomico`, explicit `search_path`, `REVOKE`, and `GRANT` statements.
- Did not run database migration or integration tests in this slice.


## Slice B — Server Action Integration

### Completed Tasks

- [x] 2.1 Updated `src/app/actions/estoque.ts` so `ajustarEstoque` keeps auth/Zod/revalidation but calls `.rpc('ajustar_estoque_atomico', ...)` instead of separate product update and movement insert writes.
- [x] 2.2 Preserved the success response shape with `qtd_anterior` and `qtd_nova`, while including optional `movimentacao_id` and `produto_ativo` returned by the RPC.
- [x] 2.3 Mapped RPC/database failures to existing clear errors: product not found, insufficient stock, invalid data, denied access, and generic database failure.

### Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/app/actions/estoque.ts` | Modified | Routes stock adjustment through the atomic RPC. |
| `supabase/migrations/20260711144706_admin_products_inventory_hardening.sql` | Modified | Tightened null validation for `p_tipo`. |
| `openspec/changes/admin-products-inventory-hardening/tasks.md` | Updated | Marks Phase 2 tasks complete. |
| `openspec/changes/admin-products-inventory-hardening/apply-progress.md` | Updated | Adds Slice B progress. |

### Verification Performed

- Source-inspected `ajustarEstoque` to confirm the previous split `produtos.update(...)` + `movimentacoes_estoque.insert(...)` flow was removed.
- Confirmed `revalidatePath('/atendimento/admin')` still runs only after successful RPC completion.


## Slice C — Tests and Invariants

### Completed Tasks

- [x] 3.1 Added Vitest coverage for `src/app/actions/estoque.ts`: RPC parameters, preserved return shape, revalidation behavior, validation failure, and RPC error mapping.
- [x] 3.2 Added SQL verification coverage plus a runtime SQL script for the RPC migration: success writing product+movement, insufficient-stock no-write path, movement insert failure rollback, cancelamento, and unauthorized anon execute blocking.
- [x] 3.3 Added schema verification that `public.produtos.ordem_exibicao` exists and no drag-and-drop UI behavior is introduced in this slice.

### Files Changed

| File | Action | Notes |
|------|--------|-------|
| `tests/unit/estoque-action.test.ts` | Created | Unit tests for `ajustarEstoque` RPC integration. |
| `tests/unit/inventory-rpc-migration.test.ts` | Created | Static SQL invariant tests for migration/RPC behavior. |
| `supabase/tests/admin_products_inventory_hardening.sql` | Created | Runtime SQL verification script for atomic RPC behavior and rollback. |
| `openspec/changes/admin-products-inventory-hardening/tasks.md` | Updated | Marks Phase 3 tasks complete. |
| `openspec/changes/admin-products-inventory-hardening/apply-progress.md` | Updated | Adds Slice C progress. |

### Verification Performed

- `npm run test:unit -- tests/unit/estoque-action.test.ts tests/unit/inventory-rpc-migration.test.ts` → PASS, 2 files / 10 tests.
- `supabase db push --local` → PASS, applied `20260711144706_admin_products_inventory_hardening.sql` to local Supabase.
- `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` → PASS, runtime SQL verified success, cancelamento, insufficient stock no-write, movement failure rollback, and anon execute blocking.


## Slice D — Verification and Follow-ups

### Completed Tasks

- [x] 4.1 Ran focused tests, full unit suite, lint, and production build.
- [x] 4.2 Documented follow-up: migrate `src/app/actions/pedidos.ts` order confirmation/cancellation to atomic order-stock handling in a separate change.
- [x] 4.3 Documented follow-up: implement drag-and-drop product ordering UI in a separate change after `ordem_exibicao` is deployed.

### Verification Evidence

- `npm run test:unit -- tests/unit/estoque-action.test.ts tests/unit/inventory-rpc-migration.test.ts` → PASS, 2 files / 10 tests.
- `supabase db push --local` → PASS, applied `20260711144706_admin_products_inventory_hardening.sql` to local Supabase.
- `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` → PASS, runtime SQL verified success, cancelamento, insufficient stock no-write, movement failure rollback, and anon execute blocking.
- `npm run test:unit` → PASS, 15 files / 84 tests.
- `npm run lint` → PASS with 2 pre-existing warnings:
  - `src/app/cliente/perfil/page.tsx`: missing `useEffect` dependencies `router` and `supabase`.
  - `src/components/operator/AdminDashboard.tsx`: unused `index`.
- `npm run build` → PASS when run outside sandbox; sandboxed build failed only because Next could not fetch Google Fonts.

### Follow-ups Deferred by Design

- `src/app/actions/pedidos.ts` still needs a separate SDD change for atomic order-stock confirmation/cancellation.
- Drag-and-drop product ordering UI should be implemented in separate SDD change `admin-products-drag-drop-ordering`, using `produtos.ordem_exibicao`.

## Pending Tasks

- None for apply. Ready for SDD verify.

## Review Remediation

Fresh-context review initially returned FAIL because `cancelamento` was rejected and task 3.2 lacked runtime DB evidence. Remediation completed:

- `cancelamento` is now accepted by the Zod schema, TypeScript action signature, and RPC logic; RPC treats it like stock restoration/addition.
- The RPC signature now uses `public.tipo_movimentacao` as designed.
- Added `supabase/tests/admin_products_inventory_hardening.sql` and executed it successfully against local Supabase after applying the migration with `supabase db push --local`.
