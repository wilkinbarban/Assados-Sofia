create or replace function public.recuperar_reconciliacao_imagem_orfa(
  p_reconciliacao_id uuid,
  p_confirmar_remocao boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_event_type text;
begin
  if v_actor_id is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  update public.produto_imagem_orfao_reconciliacoes
  set status = case when p_confirmar_remocao then 'completed' else 'failed' end,
      completed_at = case when p_confirmar_remocao then now() else null end,
      last_error = case when p_confirmar_remocao then null else 'MANUAL_RECOVERY_NOT_REMOVED' end,
      claim_token = null,
      claimed_at = null,
      updated_at = now()
  where id = p_reconciliacao_id
    and status = 'claimed';

  if not found then
    return false;
  end if;

  v_event_type := case when p_confirmar_remocao then 'completed' else 'failed' end;
  insert into public.produto_imagem_orfao_eventos (reconciliacao_id, actor_id, event_type, details)
  values (p_reconciliacao_id, v_actor_id, v_event_type, 'MANUAL_CLAIM_RECOVERY');

  return true;
end;
$$;

revoke all on function public.recuperar_reconciliacao_imagem_orfa(uuid, boolean) from public, anon, service_role;
grant execute on function public.recuperar_reconciliacao_imagem_orfa(uuid, boolean) to authenticated;
