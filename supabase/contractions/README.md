# Deferred Supabase contractions

Files in this directory are executable, release-gated contractions. They are deliberately not part of `supabase/migrations/`, so the expansion and the rollback-safety removal cannot run in the same deployment.

## Promoting the inventory RPC bridge contraction

1. Deploy the expansion migration and the server action that calls `ajustar_estoque_atomico(uuid, integer, tipo_movimentacao, text)` through an authenticated session.
2. Verify the deployed build and telemetry show no calls to the five-argument bridge during the agreed rollback window.
3. Confirm the rollback plan no longer relies on the old service-role caller.
4. A maintainer applies `20260712_admin_products_inventory_rpc_bridge.sql` as an explicit one-off production change, using the release team's normal audited SQL execution path.
5. Record the rollout evidence with the release and remove this deferred artifact only after the contraction has been applied everywhere required.

Never copy a deferred contraction into `supabase/migrations/`: that would remove the bridge during the same deployment that needs it for rollback safety.
