# Verification Report: admin-products-inventory-hardening

## Verdict

PASS

## Summary

The change is complete and verified. The inventory adjustment path now uses an atomic Postgres RPC, the product display ordering column exists for the future drag-and-drop change, and focused runtime evidence passed after correcting an RPC permission gap for `anon`.

## Task Completion

| Area | Status | Evidence |
|---|---:|---|
| Database foundation | PASS | `tasks.md` shows 1.1-1.3 complete; migration defines `ordem_exibicao`, `idx_produtos_ordem_exibicao`, and `public.ajustar_estoque_atomico(...)`. |
| Server action integration | PASS | `src/app/actions/estoque.ts` calls `.rpc('ajustar_estoque_atomico', ...)` and preserves the existing response shape with quantity fields. |
| Tests and invariants | PASS | Vitest and SQL verification passed. |
| Follow-up documentation | PASS | `tasks.md` records order-stock atomicity and drag-and-drop ordering as follow-up work. |

Completed tasks: 12/12.

## Runtime Evidence

| Command | Exit | Result |
|---|---:|---|
| `npm run build` | 0 | Next.js production build completed successfully. |
| `npx vitest run tests/unit/inventory-rpc-migration.test.ts tests/unit/estoque-action.test.ts` | 0 | 2 files passed, 10 tests passed. |
| `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` | 0 | SQL transaction passed and rolled back. |

## Issues Found During Verification

### Fixed: `anon` still had EXECUTE privilege on the atomic RPC

- Severity: CRITICAL before fix.
- Evidence: the SQL verification initially failed with `anon must not be able to execute ajustar_estoque_atomico`.
- Root cause: the migration revoked from `public` but did not explicitly revoke from `anon`.
- Fix: added explicit `revoke all ... from anon;` in `supabase/migrations/20260711144706_admin_products_inventory_hardening.sql` and applied the same revoke to the local Supabase database before re-running SQL verification.
- Final evidence: SQL verification passed after the fix.

## Spec Compliance Matrix

| Requirement | Status | Evidence |
|---|---:|---|
| Product display order schema seed | PASS | Migration adds `public.produtos.ordem_exibicao integer not null default 0` and ordering index. |
| Atomic stock adjustment RPC | PASS | Migration defines a single transaction-scoped RPC with row lock, quantity validation, product update, and movement insert. |
| Controlled stock cannot go negative | PASS | RPC raises `ESTOQUE_INSUFICIENTE`; SQL test verifies rollback behavior. |
| Server action uses the RPC | PASS | `src/app/actions/estoque.ts` delegates stock mutation to `.rpc('ajustar_estoque_atomico', ...)`. |
| Unauthorized role cannot execute RPC | PASS | SQL verification checks `anon` has no execute privilege. |

## Warnings

None blocking.

## Final Decision

Archive-ready.
