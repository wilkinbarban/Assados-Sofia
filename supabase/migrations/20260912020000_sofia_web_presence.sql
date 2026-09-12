-- Customer-facing projection only. The durable activity authority remains private.
create function public.get_sofia_conversation_presence(p_conversa_id uuid)
returns table(status text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente_id uuid;
begin
  if auth.uid() is null or p_conversa_id is null then
    raise exception using errcode = '42501', message = 'SOFIA_PRESENCE_ACCESS_DENIED';
  end if;

  select c.cliente_id into v_cliente_id
  from public.conversas c
  where c.id = p_conversa_id;
  if not found then
    raise exception using errcode = '42501', message = 'SOFIA_PRESENCE_ACCESS_DENIED';
  end if;

  if not exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.ativo = true
      and p.funcao in ('admin', 'supervisor', 'vendedor')
  ) and not exists (
    select 1 from public.clientes c
    where c.id = v_cliente_id and c.usuario_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'SOFIA_PRESENCE_ACCESS_DENIED';
  end if;

  return query
    select p.status, p.expires_at
    from public.sofia_conversation_presence p
    where p.conversa_id = p_conversa_id
      and p.status = 'composing'
      and p.expires_at > pg_catalog.clock_timestamp();
end
$$;

revoke all on function public.get_sofia_conversation_presence(uuid) from public, anon;
grant execute on function public.get_sofia_conversation_presence(uuid) to authenticated;
