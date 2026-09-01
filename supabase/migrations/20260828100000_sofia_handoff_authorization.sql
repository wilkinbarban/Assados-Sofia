-- Harden legacy Sofia handoff SECURITY DEFINER functions at the database boundary.
create or replace function public.sofia_handoff_actor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then
    if auth.role() = 'service_role' then return null; end if;
    raise exception using errcode = '42501', message = 'SOFIA_HANDOFF_OPERATOR_REQUIRED';
  end if;
  if not exists (
    select 1 from public.perfis p
    where p.id = actor and p.ativo
      and p.funcao in ('admin', 'supervisor', 'vendedor')
  ) then
    raise exception using errcode = '42501', message = 'SOFIA_HANDOFF_OPERATOR_REQUIRED';
  end if;
  return actor;
end $$;

revoke all on function public.sofia_handoff_actor() from public, anon, authenticated;
grant execute on function public.sofia_handoff_actor() to authenticated, service_role;

-- Recreate writers with caller validation while preserving the legacy signatures.
alter function public.silenciar_sofia_cliente(uuid, integer, varchar, uuid) set search_path = '';
alter function public.reativar_sofia_cliente(uuid, uuid) set search_path = '';
revoke all on function public.silenciar_sofia_cliente(uuid, integer, varchar, uuid) from public, anon;
revoke all on function public.reativar_sofia_cliente(uuid, uuid) from public, anon;
grant execute on function public.silenciar_sofia_cliente(uuid, integer, varchar, uuid) to authenticated, service_role;
grant execute on function public.reativar_sofia_cliente(uuid, uuid) to authenticated, service_role;

-- Existing function bodies call this guard through a statement-level hook wrapper.
create or replace function public.enforce_sofia_handoff_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  declare actor uuid := public.sofia_handoff_actor();
  begin
    if actor is not null then
      new.alterado_por := actor;
      new.origem := 'operator';
    end if;
  end;
  return new;
end $$;
drop trigger if exists enforce_sofia_handoff_actor on public.whatsapp_sofia_states;
create trigger enforce_sofia_handoff_actor
before insert or update on public.whatsapp_sofia_states
for each row execute function public.enforce_sofia_handoff_actor();
