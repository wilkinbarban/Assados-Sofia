# Design: Admin Products Drag-and-Drop Ordering

## Technical Approach

Add drag-and-drop reordering to the existing admin products table in `ProductCRUD`, persist only the currently rendered product IDs through a new server action, and make the admin products page load `ordem_exibicao` as the primary sort key. The implementation reuses `produtos.ordem_exibicao`; no schema or customer catalog query changes are required.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Drag-and-drop implementation | Use native HTML drag events in `ProductCRUD.tsx` with explicit drag handles | Add `@dnd-kit`/other dependency | Current dependencies do not include a DnD library; the table reorder use case is simple enough to avoid dependency and bundle growth. |
| Persistence scope | Send only the IDs from `produtosFiltrados` after the local reorder | Send all products or send filter criteria to the server | The product rule is filtered-list semantics. The client already owns the visible set after search/status filtering, so the contract stays small and prevents updating hidden products. |
| Ordering values | Recompute `ordem_exibicao` for the submitted visible IDs as 1-based positions | Preserve global gaps, generate fractional positions, or add a separate scoped order model | No schema changes are allowed. Recomputing submitted IDs is deterministic and leaves non-visible products untouched, accepting that duplicate order values can exist outside the active filter. |
| Admin/customer isolation | Change only `/atendimento/produtos` loading and product admin actions | Update shared catalog queries | The spec forbids customer-facing order changes unless already shared by design; current customer paths are not part of this change. |

## Data Flow

    ProdutosPage loads produtos ordered by ordem_exibicao/name
        ↓
    ProductCRUD keeps full local produtos state
        ↓ filter by busca/status
    Admin drags one visible row within produtosFiltrados
        ↓
    Client reorders the full local produtos array by replacing the visible slice order only
        ↓
    reordenarProdutosVisiveis([{ id, ordem_exibicao }]) updates only submitted IDs
        ↓
    /atendimento/produtos is revalidated; refresh reloads saved admin order

## File Changes

| File | Action | Description |
|---|---|---|
| `src/app/atendimento/produtos/page.tsx` | Modify | Select `ordem_exibicao` and order admin products by `ordem_exibicao` ascending with `nome` as stable tie-breaker. |
| `src/components/operator/ProductCRUD.tsx` | Modify | Add `ordem_exibicao` to `Produto`, drag state, row drag handles, visible-list reorder logic, optimistic update, pending/error handling, and call the new action. |
| `src/app/actions/produtos.ts` | Modify | Add `reordenarProdutosVisiveis` with permission check, Zod validation, updates limited to submitted product IDs, and path revalidation. |
| `src/components/operator/ProductCRUD.test.tsx` | Create | Cover filtered visible reorder behavior and action payload construction if component tests are added. |
| `src/app/actions/produtos.test.ts` | Create/Modify | Cover validation and update payload semantics with mocked Supabase if action tests already exist or are introduced for this change. |

## Interfaces / Contracts

```ts
export interface Produto {
  id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  ativo: boolean
  url_imagem: string | null
  ordem_exibicao: number | null
  data_criacao?: string
  data_atualizacao?: string
}

export async function reordenarProdutosVisiveis(
  itens: Array<{ id: string; ordem_exibicao: number }>
): Promise<{ success: true } | { success: false; error: string; details?: unknown }>
```

Client contract: `itens` MUST contain the post-drag order for the active visible list only. Server contract: validate unique IDs, positive integer order values, authorized operator, and update only those IDs.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Reorder helper keeps hidden products in place and changes only visible sequence | Extract a small pure helper or test via component behavior. |
| Integration | Server action validates payload and updates only submitted IDs | Mock Supabase query chain; assert no update is attempted for hidden IDs. |
| E2E | Admin reorder persists after refresh in filtered view | Playwright drag/reload flow if authenticated admin fixtures exist. |

## Migration / Rollout

No migration required. Roll out by shipping the admin UI/action changes. Existing products with `null` `ordem_exibicao` should sort after numbered rows using the database/client fallback; new manual reorders will populate submitted visible products.

## Open Questions

- [ ] Should duplicate `ordem_exibicao` values outside the active filter be tolerated indefinitely, or should a later global normalization tool be planned?
- [ ] Should drag-and-drop be disabled while search text is non-empty to reduce admin confusion, or is the filtered-list behavior explicit enough in UI copy?
