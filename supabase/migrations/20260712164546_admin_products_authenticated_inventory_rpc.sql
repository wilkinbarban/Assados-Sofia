-- Replace the caller-controlled inventory actor with the authenticated request actor.
-- Keep the deprecated signature only as a service_role-only rollback bridge.

revoke all on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)
  from public, anon, authenticated, service_role;

drop function if exists public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text);
drop function if exists public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid);

create function public.ajustar_estoque_atomico(
  p_produto_id uuid,
  p_quantidade integer,
  p_tipo public.tipo_movimentacao,
  p_motivo text default null
)
returns table(
  qtd_anterior integer,
  qtd_nova integer,
  movimentacao_id uuid,
  produto_ativo boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto record;
  v_qtd_nova integer;
  v_movimentacao_id uuid;
  v_produto_ativo boolean;
  v_usuario_id uuid;
begin
  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTENTICADO';
  end if;

  if not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  if p_produto_id is null then
    raise exception using errcode = '22023', message = 'PRODUTO_ID_OBRIGATORIO';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception using errcode = '22023', message = 'QUANTIDADE_INVALIDA';
  end if;

  if p_tipo is null or p_tipo not in ('entrada', 'saida', 'ajuste', 'cancelamento') then
    raise exception using errcode = '22023', message = 'TIPO_MOVIMENTACAO_INVALIDO';
  end if;

  select p.id, p.quantidade_estoque, p.controlar_estoque, p.ativo
    into v_produto
  from public.produtos p
  where p.id = p_produto_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_ENCONTRADO';
  end if;

  if p_tipo in ('entrada', 'cancelamento') then
    v_qtd_nova := v_produto.quantidade_estoque + p_quantidade;
  elsif p_tipo = 'saida' then
    v_qtd_nova := v_produto.quantidade_estoque - p_quantidade;
  else
    v_qtd_nova := p_quantidade;
  end if;

  if v_qtd_nova < 0 then
    raise exception using errcode = '23514', message = 'ESTOQUE_INSUFICIENTE';
  end if;

  v_produto_ativo := case
    when v_produto.controlar_estoque and v_qtd_nova <= 0 then false
    else v_produto.ativo
  end;

  update public.produtos
  set quantidade_estoque = v_qtd_nova,
      ativo = v_produto_ativo,
      data_atualizacao = now()
  where id = p_produto_id;

  insert into public.movimentacoes_estoque (
    produto_id,
    tipo,
    quantidade,
    quantidade_anterior,
    quantidade_nova,
    motivo,
    usuario_id
  ) values (
    p_produto_id,
    p_tipo,
    p_quantidade,
    v_produto.quantidade_estoque,
    v_qtd_nova,
    nullif(p_motivo, ''),
    v_usuario_id
  )
  returning id into v_movimentacao_id;

  qtd_anterior := v_produto.quantidade_estoque;
  qtd_nova := v_qtd_nova;
  movimentacao_id := v_movimentacao_id;
  produto_ativo := v_produto_ativo;
  return next;
end;
$$;

comment on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text) is
  'Atomically adjusts stock for the active admin or supervisor in auth.uid(); the movement actor is never caller-controlled.';

revoke all on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)
  from public, anon, service_role;

grant execute on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)
  to authenticated;

create function public.ajustar_estoque_atomico(
  p_produto_id uuid,
  p_quantidade integer,
  p_tipo public.tipo_movimentacao,
  p_motivo text,
  p_usuario_id uuid
)
returns table(qtd_anterior integer, qtd_nova integer, movimentacao_id uuid, produto_ativo boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_usuario_id is null then
    raise exception using errcode = '22023', message = 'USUARIO_ID_OBRIGATORIO';
  end if;

  -- service_role does not carry an end-user JWT. The rollback-only bridge
  -- supplies the legacy actor as a transaction-local claim so the official
  -- auth.uid()-bound implementation remains the single write path.
  perform set_config('request.jwt.claim.sub', p_usuario_id::text, true);
  return query
  select * from public.ajustar_estoque_atomico(p_produto_id, p_quantidade, p_tipo, p_motivo);
end;
$$;

revoke all on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)
  to service_role;

comment on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid) is
  'Temporary service_role-only rollback bridge for the pre-session caller. Remove this bridge in the mandatory post-rollout contraction after the four-argument caller is confirmed live.';

-- Inventory is an RPC-only write boundary. API callers retain the reads they
-- already require, but cannot forge movement history or change stock directly.
alter table public.produtos enable row level security;
alter table public.movimentacoes_estoque enable row level security;

revoke all on table public.produtos from public, anon, authenticated;
revoke all on table public.movimentacoes_estoque from public, anon, authenticated;

grant select on table public.produtos to anon, authenticated;
grant select on table public.movimentacoes_estoque to authenticated;

drop policy if exists "Escrita de produtos por admin ou supervisor" on public.produtos;
drop policy if exists "Escrita de movimentações por operadores" on public.movimentacoes_estoque;

-- Keep product images publicly readable, but make mutations an active
-- admin/supervisor-only boundary. Slice 2 uses these session-bound INSERT,
-- UPDATE, and DELETE capabilities for versioned uploads and cleanup.
drop policy if exists "Upload de imagens por operadores" on storage.objects;
drop policy if exists "Exclusão de imagens por operadores" on storage.objects;

create policy "Upload de imagens de produtos por admin ou supervisor"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'produto-imagens'
  and public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])
);

create policy "Atualização de imagens de produtos por admin ou supervisor"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'produto-imagens'
  and public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])
)
with check (
  bucket_id = 'produto-imagens'
  and public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])
);

create policy "Exclusão de imagens de produtos por admin ou supervisor"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'produto-imagens'
  and public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])
);
