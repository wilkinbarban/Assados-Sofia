-- Deferred contraction: intentionally excluded from supabase/migrations/.
--
-- promotion procedure:
-- 1. Confirm the deployed server action calls only the authenticated four-argument
--    public.ajustar_estoque_atomico RPC.
-- 2. Confirm production telemetry/logs show no five-argument bridge calls for the
--    agreed rollback window and that rollback no longer needs the legacy caller.
-- 3. Have a maintainer apply this exact file as a one-off database change only
--    after the four-argument caller rollout is verified.
-- 4. Record the deployment evidence, then retire this deferred artifact in the
--    same release documentation. Do not move this file into supabase/migrations/.
--
-- This is safe to run once the gate above is satisfied. It preserves the official
-- four-argument authenticated RPC and removes only the legacy bridge signature.

begin;

do $$
begin
  if to_regprocedure('public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)') is null then
    raise exception 'official four-argument inventory RPC is missing; refusing bridge contraction';
  end if;

  if to_regprocedure('public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)') is null then
    raise exception 'legacy inventory bridge is already absent; refusing non-idempotent contraction';
  end if;
end;
$$;

revoke all on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)
  from public, anon, authenticated, service_role;

drop function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid);

commit;
