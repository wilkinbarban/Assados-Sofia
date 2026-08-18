-- Authenticated, compensable product-image lifecycle. Storage mutations remain
-- session/RLS-bound; these narrow RPCs are the only product-row and durable
-- cleanup-record write boundaries exposed to the server action.

create table if not exists public.produto_imagem_cleanup_pendentes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null,
  paths text[] not null check (cardinality(paths) > 0),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  tentativas integer not null default 0 check (tentativas >= 0),
  ultimo_erro text not null,
  data_criacao timestamptz not null default now(),
  data_atualizacao timestamptz not null default now(),
  concluida_em timestamptz
);

alter table public.produto_imagem_cleanup_pendentes enable row level security;
revoke all on table public.produto_imagem_cleanup_pendentes from public, anon, authenticated;

create or replace function public.substituir_imagem_produto(
  p_produto_id uuid,
  p_slot integer,
  p_full_path text,
  p_thumb_path text
)
returns table(full text, thumb text, cleanup_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_full text;
  v_previous_thumb text;
  v_previous_paths text[];
  v_cleanup_id uuid;
  v_path text;
  v_path_prefix text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTENTICADO';
  end if;

  if not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  if p_slot is null or p_slot not in (1, 2) then
    raise exception using errcode = '22023', message = 'SLOT_IMAGEM_INVALIDO';
  end if;

  v_path_prefix := 'produtos/' || p_produto_id::text || '/' || p_slot::text || '/';
  if p_full_path !~ ('^' || v_path_prefix || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/full\.webp$')
    or p_thumb_path !~ ('^' || v_path_prefix || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/thumb\.webp$') then
    raise exception using errcode = '22023', message = 'CAMINHO_IMAGEM_INVALIDO';
  end if;

  select
    case when p_slot = 1 then p.url_imagem else p.url_imagem_2 end,
    case when p_slot = 1 then p.url_imagem_thumb else p.url_imagem_2_thumb end
  into v_previous_full, v_previous_thumb
  from public.produtos p
  where p.id = p_produto_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_ENCONTRADO';
  end if;

  v_previous_paths := array_remove(array[v_previous_full, v_previous_thumb], null);
  if cardinality(v_previous_paths) > 0 then
    foreach v_path in array v_previous_paths loop
      if v_path !~ ('^produtos/' || p_produto_id::text || '/[12]/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(full|thumb)\.webp$')
        and v_path !~ ('^prod_' || p_produto_id::text || '(_2)?_(full|thumb)\.webp$') then
        raise exception using errcode = '22023', message = 'CAMINHO_IMAGEM_INVALIDO';
      end if;
    end loop;
    insert into public.produto_imagem_cleanup_pendentes (produto_id, paths, ultimo_erro)
    values (p_produto_id, v_previous_paths, 'LIMPEZA_SUBSTITUICAO_PENDENTE')
    returning id into v_cleanup_id;
  end if;

  if p_slot = 1 then
    update public.produtos
    set url_imagem = p_full_path,
        url_imagem_thumb = p_thumb_path,
        data_atualizacao = now()
    where id = p_produto_id;
  else
    update public.produtos
    set url_imagem_2 = p_full_path,
        url_imagem_2_thumb = p_thumb_path,
        data_atualizacao = now()
    where id = p_produto_id;
  end if;

  return query
  select v_previous_full as full, v_previous_thumb as thumb, v_cleanup_id as cleanup_id;
end;
$$;

create or replace function public.registrar_limpeza_imagem_pendente(
  p_produto_id uuid,
  p_paths text[],
  p_error text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_cleanup_id uuid;
begin
  if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  if cardinality(p_paths) is null or cardinality(p_paths) = 0 or coalesce(nullif(p_error, ''), '') = '' then
    raise exception using errcode = '22023', message = 'LIMPEZA_PENDENTE_INVALIDA';
  end if;

  foreach v_path in array p_paths loop
    if v_path is null or (
      v_path !~ ('^produtos/' || p_produto_id::text || '/[12]/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(full|thumb)\.webp$')
      and v_path !~ ('^prod_' || p_produto_id::text || '(_2)?_(full|thumb)\.webp$')
    ) then
      raise exception using errcode = '22023', message = 'CAMINHO_IMAGEM_INVALIDO';
    end if;
  end loop;

  insert into public.produto_imagem_cleanup_pendentes (produto_id, paths, ultimo_erro)
  values (p_produto_id, p_paths, p_error)
  returning id into v_cleanup_id;

  return v_cleanup_id;
end;
$$;

create or replace function public.obter_limpeza_imagem_pendente(p_cleanup_id uuid)
returns table(id uuid, produto_id uuid, paths text[], tentativas integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  return query
  select c.id, c.produto_id,
    coalesce((
      select array_agg(path)
      from unnest(c.paths) as candidate(path)
      where not exists (
        select 1
        from public.produtos p
        where p.url_imagem = path
          or p.url_imagem_thumb = path
          or p.url_imagem_2 = path
          or p.url_imagem_2_thumb = path
      )
    ), array[]::text[]),
    c.tentativas
  from public.produto_imagem_cleanup_pendentes c
  where c.id = p_cleanup_id and c.status = 'pending';
end;
$$;

create or replace function public.falhar_limpeza_imagem_pendente(p_cleanup_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  update public.produto_imagem_cleanup_pendentes
  set tentativas = tentativas + 1,
      ultimo_erro = p_error,
      data_atualizacao = now()
  where id = p_cleanup_id and status = 'pending';
end;
$$;

create or replace function public.concluir_limpeza_imagem_pendente(p_cleanup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  update public.produto_imagem_cleanup_pendentes
  set status = 'completed',
      concluida_em = now(),
      data_atualizacao = now()
  where id = p_cleanup_id and status = 'pending';
end;
$$;

revoke all on function public.substituir_imagem_produto(uuid, integer, text, text) from public, anon, service_role;
revoke all on function public.registrar_limpeza_imagem_pendente(uuid, text[], text) from public, anon, service_role;
revoke all on function public.obter_limpeza_imagem_pendente(uuid) from public, anon, service_role;
revoke all on function public.falhar_limpeza_imagem_pendente(uuid, text) from public, anon, service_role;
revoke all on function public.concluir_limpeza_imagem_pendente(uuid) from public, anon, service_role;

grant execute on function public.substituir_imagem_produto(uuid, integer, text, text) to authenticated;
grant execute on function public.registrar_limpeza_imagem_pendente(uuid, text[], text) to authenticated;
grant execute on function public.obter_limpeza_imagem_pendente(uuid) to authenticated;
grant execute on function public.falhar_limpeza_imagem_pendente(uuid, text) to authenticated;
grant execute on function public.concluir_limpeza_imagem_pendente(uuid) to authenticated;
