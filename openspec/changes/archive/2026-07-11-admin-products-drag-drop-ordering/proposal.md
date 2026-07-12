# Proposal: Admin Products Drag-and-Drop Ordering

## Intent

Allow admins to manually reorder product cards inside the currently visible/filtered list so the dashboard reflects the intended display priority. Persist the order with the existing `public.produtos.ordem_exibicao` column, without expanding stock-hardening scope.

## Scope

### In Scope
- Drag-and-drop reordering within the current filtered/visible admin product list.
- Persist reordered positions using `produtos.ordem_exibicao`.
- Update admin product rendering to respect the saved order in the filtered view.
- Keep the ordering change scoped to admin display behavior unless existing product queries already rely on the same column by design.

### Out of Scope
- Global ordering across all products regardless of filters.
- Stock adjustment hardening, movement audit changes, or inventory rules.
- Customer-facing ordering changes unless already coupled to the same query path.
- New schema changes for `ordem_exibicao`.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `estoque`: add manual product reordering in admin products, persisted through `ordem_exibicao` with filtered-list semantics.

## Approach

- Extend the admin product card/list UI to support drag handles and reordering within the currently rendered filtered set.
- Update the client/server action flow in `src/app/actions/produtos.ts` to persist a reordered sequence for the affected products only.
- Preserve existing search/filter behavior; reorder operations must not escape the active filtered context.
- Ensure initial loading and subsequent refreshes sort by `ordem_exibicao` where the admin list is sourced.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/operator/ProductCRUD.tsx` | Modified | Add drag-and-drop interactions and local ordering state. |
| `src/app/actions/produtos.ts` | Modified | Persist reordered product positions to `ordem_exibicao`. |
| `openspec/specs/estoque/spec.md` | Modified | Update admin product requirements to include filtered-view ordering behavior. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Users expect reordering to apply globally | Medium | State explicitly that ordering is limited to the current filtered view. |
| Filtered list reorder creates surprising gaps/conflicts | Medium | Recompute only the visible slice and keep persistence deterministic. |
| Customer-facing order changes unintentionally | Low | Restrict query-path changes to admin display unless already shared by design. |

## Rollback Plan

Disable the drag-and-drop UI and stop writing `ordem_exibicao`; existing product data remains valid. If needed, revert admin list sorting to the previous behavior without touching stock-related logic or the database schema.

## Dependencies

- Existing `public.produtos.ordem_exibicao` column from the archived inventory hardening change.

## Success Criteria

- [ ] Admin users can reorder products inside the current filtered list and the order persists after refresh.
- [ ] Reordering does not affect products outside the active filter scope.
- [ ] Admin display order follows `ordem_exibicao` without changing stock-hardening behavior.
