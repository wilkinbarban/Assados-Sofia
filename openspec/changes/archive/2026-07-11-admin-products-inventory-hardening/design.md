# Design: Admin Products Inventory Hardening

## Technical Approach

Move inventory mutations from two application writes to one Postgres RPC. The existing `ajustarEstoque` action already validates admin/supervisor access, uses `createAdminClient()`, updates `produtos`, then inserts `movimentacoes_estoque`; the gap is that the second write can fail after stock changed. The new RPC will lock the product row, compute the new quantity, update stock/status, and insert the movement in the same database transaction. Full drag-drop ordering UI is explicitly out of scope; only the `produtos.ordem_exibicao` schema column is prepared.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Atomicity boundary | Create a `public.ajustar_estoque_atomico(...)` PL/pgSQL RPC. | Keep app-level update/insert with compensation. | Supabase RPC executes inside one Postgres transaction, so errors roll back both stock and movement. |
| Concurrency | `SELECT ... FROM public.produtos WHERE id = p_produto_id FOR UPDATE`. | Optimistic updates only. | Row locking serializes concurrent adjustments for the same product and avoids stale stock calculations. |
| Security posture | Keep Server Action auth as first gate; use RPC `security invoker` by default, explicit schema qualification/search path, revoke broad execute, grant only required role(s). If `security definer` is required because `service_role`/RLS interaction changes, set `search_path = ''`, qualify all objects, check `p_usuario_id` against `perfis`, and revoke execute from `PUBLIC`, `anon`, and unauthorized roles. | Public callable definer function. | Supabase/Postgres functions can become public APIs if execute is not restricted; least privilege keeps stock mutation behind the server action and DB validation. |
| Return contract | RPC returns `qtd_anterior`, `qtd_nova`, `movimentacao_id`, `produto_ativo`. Server action keeps `{ success: true, data: { qtd_anterior, qtd_nova } }` and may include extra fields. | Change UI response shape. | `InventoryManager` already consumes `res.data.qtd_nova`; compatibility avoids UI churn. |

## Data Flow

```text
InventoryManager -> ajustarEstoque server action
  -> verificarPermissaoAdminEstoque + Zod validation
  -> Supabase RPC ajustar_estoque_atomico
      -> lock produto row
      -> validate tipo/quantity/non-negative controlled stock
      -> update produtos
      -> insert movimentacoes_estoque
      -> return quantities
  -> revalidatePath('/atendimento/admin') -> compatible result
```

`pedidos.ts` has separate confirm/cancel stock flows with the same split-write pattern. Per product decision, order confirmation/cancellation migration is deferred to a follow-up because full order + stock atomicity is broader than this slice.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<generated>_admin_products_inventory_hardening.sql` | Create | Add `produtos.ordem_exibicao INTEGER NOT NULL DEFAULT 0`, optional index for future ordering, and RPC/grants/comments. Generate name via `supabase migration new`. |
| `src/app/actions/estoque.ts` | Modify | Replace product lookup/update/movement insert in `ajustarEstoque` with `.rpc('ajustar_estoque_atomico', ...)`; keep auth, Zod errors, `revalidatePath`, and return shape. |
| `src/app/actions/pedidos.ts` | Follow-up only | Do not modify in this slice; document the same split-write risk for a future order-stock atomicity change. |
| `src/components/operator/InventoryManager.tsx` | No functional UI expansion | Preserve current quick adjustment UX; no drag-drop UI. |
| `tests/unit/...` / migration tests | Create/modify | Cover action/RPC integration boundaries and invariants. |

## Interfaces / Contracts

RPC parameters: `p_produto_id uuid`, `p_quantidade integer`, `p_tipo public.tipo_movimentacao`, `p_motivo text default null`, `p_usuario_id uuid`, `p_pedido_id uuid default null`.

RPC validations: product exists; `p_quantidade > 0`; type is valid; for `entrada` add, `saida` subtract, `cancelamento` add, `ajuste` sets absolute quantity; controlled stock cannot go below zero. Insert movement with previous/new quantities before returning.

Error codes should map cleanly in the action: `PRODUTO_NAO_ENCONTRADO`, `ESTOQUE_INSUFICIENTE`, `DADOS_INVALIDOS`, `ACESSO_NEGADO_PERMISSAO_INSUFICIENTE`, or `ERRO_BANCO: ...`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `ajustarEstoque` calls RPC and preserves return shape/errors. | Vitest mocks `createClient`, `createAdminClient().rpc`, and `revalidatePath`. |
| DB integration | Success writes stock + movement; insufficient stock writes neither; forced movement insert failure rolls back product update; unauthorized role blocked. | Supabase local SQL/integration test transaction or script using seeded products/perfis. |
| Regression | `InventoryManager` still updates from `qtd_nova`; no drag-drop behavior appears. | Existing React test style with mocked action response. |

## Migration / Rollout

Apply migration first; adding `ordem_exibicao` with default is backward-compatible. Deploy server action after RPC exists. Monitor stock adjustment logs and error rates. Rollback by reverting the action and dropping the RPC/column only if no dependent future ordering work has started.

## Open Questions

None. Product decision: `confirmarPedidoOperador`/`cancelarPedido` remain a follow-up because order + stock atomicity is broader than this inventory-admin slice.
