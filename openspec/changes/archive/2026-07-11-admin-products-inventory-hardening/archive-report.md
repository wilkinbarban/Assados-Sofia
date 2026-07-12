# Archive Report: admin-products-inventory-hardening

## Status

Archived with verified implementation evidence.

## Verification Summary

- Final verdict: PASS.
- Tasks complete: 12/12.
- Build evidence: `npm run build` exited 0.
- Unit evidence: `npx vitest run tests/unit/inventory-rpc-migration.test.ts tests/unit/estoque-action.test.ts` exited 0 with 2 files and 10 tests passing.
- Database evidence: `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` exited 0 after the explicit `anon` revoke fix.
- Native review transaction: `approved` with evidence hash `sha256:781dfb7cf2406a79d3885beecb4329e69d661f6fd43df96b935ec9df442d0bf9`.

## Fix Applied During Verification

The SQL verification initially exposed that `anon` still had EXECUTE privilege on `public.ajustar_estoque_atomico(...)`. The migration was corrected to explicitly revoke from `anon`, and the local Supabase DB received the same revoke before re-running SQL verification successfully.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `estoque` | Updated | Added section `2.8. Ajuste Administrativo Atômico e Ordenação Futura` with atomic stock adjustment, insufficient stock protection, admin permission, invariant verification, and `ordem_exibicao` preparation requirements. |

## Native Dispatcher Note

After final verification, `gentle-ai review-resume` shows the review transaction as `approved` with zero findings and one final verification. However, `gentle-ai sdd-status` still reported `nextRecommended: resolve-review` with the inconsistent blocker `transaction failed evidence revision "" does not match failed evidence revision ""` while `remediationState.required` was false. The archive proceeds based on persisted PASS verification, approved native review transaction, completed tasks, and synced specs.

## Source of Truth Updated

- `openspec/specs/estoque/spec.md`

## Archived Artifacts

- proposal.md
- design.md
- tasks.md
- apply-progress.md
- verify-report.md
- archive-report.md
- specs/estoque/spec.md
- reviews/transaction.json
- reviews/policy.json
- reviews/bundle.json
