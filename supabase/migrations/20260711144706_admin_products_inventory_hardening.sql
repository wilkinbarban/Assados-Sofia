-- Admin products inventory hardening
-- Adds display-order schema preparation and an atomic inventory adjustment RPC.

-- Future product card ordering support. UI drag-and-drop is intentionally out of scope
-- for this change; this column only prepares the schema.
alter table public.produtos
  add column if not exists ordem_exibicao integer not null default 0;

create index if not exists idx_produtos_ordem_exibicao
  on public.produtos (ordem_exibicao, nome);

comment on column public.produtos.ordem_exibicao is
  'Display ordering seed for future admin product drag-and-drop ordering.';

create or replace function public.ajustar_estoque_atomico(
  p_produto_id uuid,
  p_quantidade integer,
  p_tipo public.tipo_movimentacao,
  p_motivo text default null,
  p_usuario_id uuid default null
)
returns table(
  qtd_anterior integer,
  qtd_nova integer,
  movimentacao_id uuid,
  produto_ativo boolean
)
language plpgsql
set search_path = public, auth
as $$
declare
  v_produto record;
  v_qtd_nova integer;
  v_movimentacao_id uuid;
  v_produto_ativo boolean;
begin
  if p_produto_id is null then
    raise exception using errcode = '22023', message = 'PRODUTO_ID_OBRIGATORIO';
  end if;

  if p_usuario_id is null then
    raise exception using errcode = '22023', message = 'USUARIO_ID_OBRIGATORIO';
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

  -- The table-level CHECK also requires non-negative stock. Keep the domain error
  -- explicit here so callers can map it without relying on a generic constraint error.
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
    p_usuario_id
  )
  returning id into v_movimentacao_id;

  qtd_anterior := v_produto.quantidade_estoque;
  qtd_nova := v_qtd_nova;
  movimentacao_id := v_movimentacao_id;
  produto_ativo := v_produto_ativo;
  return next;
end;
$$;

comment on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid) is
  'Atomically adjusts product stock and writes the matching movement log. Authorization remains enforced by RLS/policies for authenticated callers and by server-side service-role boundaries.';

revoke all on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid) from public;
revoke all on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid) from anon;
grant execute on function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid) to authenticated, service_role;
