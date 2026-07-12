# Proposal: Admin Products Inventory Hardening

## Intent
Harden admin Produtos/Estoque so stock mutations cannot leave `produtos.quantidade_estoque` and `movimentacoes_estoque` inconsistent. Today stock is updated before logging; a log failure can silently create an unaudited stock change.

## Scope

### In Scope
- Add an atomic Postgres/Supabase RPC or transaction path that updates stock and inserts the movement log indivisibly.
- Route admin stock adjustments through that path with clear failures.
- Add critical tests: success, insufficient stock, rollback-on-log-failure, permission/validation.
- Add `produtos.ordem_exibicao` as schema preparation for future manual ordering.
- Plan alignment/deprecation of overlapping legacy product flow.

### Out of Scope
- Drag-and-drop ordering UI; separate change `admin-products-drag-drop-ordering`.
- Product card redesign, image upload, or client catalog UX.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `estoque`: Require atomic stock adjustment with mandatory movement logging, critical inventory tests, and `produtos.ordem_exibicao`.

## Approach
Create a migration with `produtos.ordem_exibicao` and a database function that validates non-negative stock, computes previous/new quantity, updates `produtos`, inserts `movimentacoes_estoque`, and fails as one unit. Update the server action to call it instead of separate update/insert calls. Keep legacy `src/app/actions/produtos.ts` only where still needed, and prepare deprecation toward the Estoque action surface.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | Add column and atomic RPC. |
| `src/app/actions/estoque.ts` | Modified | Replace split update/log flow with RPC-backed operation. |
| `src/app/actions/produtos.ts` | Modified | Align or mark legacy overlap for deprecation planning. |
| `src/components/operator/InventoryManager.tsx` | Modified | Preserve UX with clearer results/errors. |
| `openspec/specs/estoque/spec.md` | Modified | Delta for atomicity, audit, tests, ordering column. |
| test files | New/Modified | Cover critical inventory invariants. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RPC overexposes stock mutation | Med | Restrict execution, validate admin/supervisor server-side, review RLS/security-definer behavior. |
| Existing UI depends on old response shape | Low | Keep compatible return fields or adapt component tests. |
| Ordering column interpreted as completed ordering feature | Low | Keep drag-and-drop UI explicitly out of scope. |

## Rollback Plan
Revert migration/function and server action together. If runtime behavior fails, temporarily switch `ajustarEstoque` back while preserving tests that document the atomicity gap.

## Dependencies
- Supabase PostgreSQL migration support and existing admin/supervisor permission checks.

## Success Criteria
- [ ] Stock update and movement log commit or rollback together.
- [ ] Insufficient stock never writes partial data.
- [ ] Critical tests cover success, failure, and authorization paths.
- [ ] `produtos.ordem_exibicao` exists without enabling drag-and-drop UI.
