-- A claimed deletion is never lease-reclaimed: concurrent Storage removals are unsafe.
create or replace function public.reivindicar_reconciliacao_imagem_orfa(p_reconciliacao_id uuid)
returns table(id uuid, object_path text, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_candidate public.produto_imagem_orfao_reconciliacoes%rowtype;
  v_is_referenced boolean;
  v_claim_token uuid := gen_random_uuid();
begin
  if v_actor_id is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  select * into v_candidate
  from public.produto_imagem_orfao_reconciliacoes
  where produto_imagem_orfao_reconciliacoes.id = p_reconciliacao_id
    and status in ('approved', 'failed')
  for update skip locked;

  if not found then
    return;
  end if;

  select exists (
    select 1
    from public.produtos p
    where p.url_imagem = v_candidate.object_path
      or p.url_imagem_thumb = v_candidate.object_path
      or p.url_imagem_2 = v_candidate.object_path
      or p.url_imagem_2_thumb = v_candidate.object_path
  ) into v_is_referenced;

  if v_is_referenced or now() - v_candidate.object_created_at < interval '24 hours' then
    update public.produto_imagem_orfao_reconciliacoes
    set status = 'protected',
        reference_status = case when v_is_referenced then 'referenced' else 'unreferenced' end,
        claim_token = null,
        claimed_at = null,
        updated_at = now()
    where produto_imagem_orfao_reconciliacoes.id = v_candidate.id;

    insert into public.produto_imagem_orfao_eventos (reconciliacao_id, actor_id, event_type, details)
    values (v_candidate.id, v_actor_id, 'protected', case when v_is_referenced then 'referenced' else 'within_grace_period' end);

    return;
  end if;

  update public.produto_imagem_orfao_reconciliacoes
  set status = 'claimed',
      claim_token = v_claim_token,
      claimed_at = now(),
      attempts = attempts + 1,
      updated_at = now()
  where produto_imagem_orfao_reconciliacoes.id = v_candidate.id;

  insert into public.produto_imagem_orfao_eventos (reconciliacao_id, actor_id, event_type)
  values (v_candidate.id, v_actor_id, 'claimed');

  return query select v_candidate.id, v_candidate.object_path, v_claim_token;
end;
$$;

revoke all on function public.reivindicar_reconciliacao_imagem_orfa(uuid) from public, anon, service_role;
grant execute on function public.reivindicar_reconciliacao_imagem_orfa(uuid) to authenticated;
