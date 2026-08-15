-- Durable approval and claim workflow for product-image orphan cleanup. Object
-- discovery and deletion stay in the Storage API; this migration never touches
-- storage.objects directly.

create table if not exists public.produto_imagem_orfao_reconciliacoes (
  id uuid primary key default gen_random_uuid(),
  object_path text not null unique check (object_path like 'produtos/%'),
  object_created_at timestamptz not null,
  discovered_at timestamptz not null,
  reference_status text not null check (reference_status in ('referenced', 'unreferenced')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'claimed', 'completed', 'protected', 'failed')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  claim_token uuid,
  claimed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

create index if not exists produto_imagem_orfao_reconciliacoes_claim_idx
  on public.produto_imagem_orfao_reconciliacoes (status, approved_at)
  where status in ('approved', 'failed');

create table if not exists public.produto_imagem_orfao_eventos (
  id uuid primary key default gen_random_uuid(),
  reconciliacao_id uuid not null references public.produto_imagem_orfao_reconciliacoes(id),
  actor_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('discovered', 'approved', 'claimed', 'protected', 'completed', 'failed')),
  details text,
  created_at timestamptz not null default now()
);

alter table public.produto_imagem_orfao_reconciliacoes enable row level security;
alter table public.produto_imagem_orfao_eventos enable row level security;
revoke all on table public.produto_imagem_orfao_reconciliacoes from public, anon, authenticated;
revoke all on table public.produto_imagem_orfao_eventos from public, anon, authenticated;

create or replace function public.registrar_reconciliacao_imagem_orfa(
  p_object_path text,
  p_object_created_at timestamptz,
  p_scan_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_referenced boolean;
  v_reference_status text;
  v_status text;
  v_id uuid;
begin
  if v_actor_id is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  if p_object_path !~ '^produtos/.+' or p_object_created_at > p_scan_at then
    raise exception using errcode = '22023', message = 'CANDIDATO_ORFAO_INVALIDO';
  end if;

  select exists (
    select 1
    from public.produtos p
    where p.url_imagem = p_object_path
      or p.url_imagem_thumb = p_object_path
      or p.url_imagem_2 = p_object_path
      or p.url_imagem_2_thumb = p_object_path
  ) into v_is_referenced;

  v_reference_status := case when v_is_referenced then 'referenced' else 'unreferenced' end;
  v_status := case
    when v_is_referenced then 'protected'
    when p_scan_at - p_object_created_at < interval '24 hours' then 'protected'
    else 'pending'
  end;

  insert into public.produto_imagem_orfao_reconciliacoes (
    object_path, object_created_at, discovered_at, reference_status, status, updated_at
  ) values (
    p_object_path, p_object_created_at, p_scan_at, v_reference_status, v_status, now()
  )
  on conflict (object_path) do update
  set object_created_at = excluded.object_created_at,
      discovered_at = excluded.discovered_at,
      reference_status = excluded.reference_status,
      status = case
        when public.produto_imagem_orfao_reconciliacoes.status in ('completed', 'claimed')
          then public.produto_imagem_orfao_reconciliacoes.status
        else excluded.status
      end,
      updated_at = now()
  returning id into v_id;

  insert into public.produto_imagem_orfao_eventos (reconciliacao_id, actor_id, event_type, details)
  values (v_id, v_actor_id, 'discovered', v_reference_status);

  return v_id;
end;
$$;

create or replace function public.aprovar_reconciliacao_imagem_orfa(p_reconciliacao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  update public.produto_imagem_orfao_reconciliacoes
  set status = 'approved',
      approved_by = v_actor_id,
      approved_at = now(),
      updated_at = now()
  where id = p_reconciliacao_id
    and status in ('pending', 'failed')
    and reference_status = 'unreferenced';

  if not found then
    return false;
  end if;

  insert into public.produto_imagem_orfao_eventos (reconciliacao_id, actor_id, event_type)
  values (p_reconciliacao_id, v_actor_id, 'approved');

  return true;
end;
$$;

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

create or replace function public.finalizar_reconciliacao_imagem_orfa(
  p_reconciliacao_id uuid,
  p_claim_token uuid,
  p_sucesso boolean,
  p_erro text default null
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

  if not p_sucesso and coalesce(nullif(p_erro, ''), '') = '' then
    raise exception using errcode = '22023', message = 'ERRO_RECONCILIACAO_OBRIGATORIO';
  end if;

  update public.produto_imagem_orfao_reconciliacoes
  set status = case when p_sucesso then 'completed' else 'failed' end,
      completed_at = case when p_sucesso then now() else null end,
      last_error = case when p_sucesso then null else p_erro end,
      claim_token = null,
      claimed_at = null,
      updated_at = now()
  where id = p_reconciliacao_id
    and status = 'claimed'
    and claim_token = p_claim_token;

  if not found then
    return false;
  end if;

  v_event_type := case when p_sucesso then 'completed' else 'failed' end;
  insert into public.produto_imagem_orfao_eventos (reconciliacao_id, actor_id, event_type, details)
  values (p_reconciliacao_id, v_actor_id, v_event_type, p_erro);

  return true;
end;
$$;

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

revoke all on function public.registrar_reconciliacao_imagem_orfa(text, timestamptz, timestamptz) from public, anon, service_role;
revoke all on function public.aprovar_reconciliacao_imagem_orfa(uuid) from public, anon, service_role;
revoke all on function public.reivindicar_reconciliacao_imagem_orfa(uuid) from public, anon, service_role;
revoke all on function public.finalizar_reconciliacao_imagem_orfa(uuid, uuid, boolean, text) from public, anon, service_role;
revoke all on function public.recuperar_reconciliacao_imagem_orfa(uuid, boolean) from public, anon, service_role;
grant execute on function public.registrar_reconciliacao_imagem_orfa(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.aprovar_reconciliacao_imagem_orfa(uuid) to authenticated;
grant execute on function public.reivindicar_reconciliacao_imagem_orfa(uuid) to authenticated;
grant execute on function public.finalizar_reconciliacao_imagem_orfa(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.recuperar_reconciliacao_imagem_orfa(uuid, boolean) to authenticated;
