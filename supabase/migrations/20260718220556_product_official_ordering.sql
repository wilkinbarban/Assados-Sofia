create or replace function public.assign_produto_ordem_exibicao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.ordem_exibicao is not null and new.ordem_exibicao > 0 then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.produtos.ordem_exibicao', 0)
  );

  select coalesce(max(p.ordem_exibicao) filter (where p.ordem_exibicao > 0), 0) + 1
    into new.ordem_exibicao
  from public.produtos p;

  return new;
end;
$$;

drop trigger if exists assign_produto_ordem_exibicao on public.produtos;
create trigger assign_produto_ordem_exibicao
before insert on public.produtos
for each row execute function public.assign_produto_ordem_exibicao();

create or replace function public.buscar_produtos_disponiveis()
returns table(
  id uuid,
  nome varchar,
  descricao text,
  preco_centavos integer,
  url_imagem text,
  url_imagem_thumb text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb
  from public.produtos p
  where p.ativo = true
    and (p.controlar_estoque = false or p.quantidade_estoque > 0)
  order by nullif(p.ordem_exibicao, 0) asc nulls last, p.nome asc, p.id asc;
$$;

create or replace function public.buscar_produto_por_nome(p_nome text)
returns table(
  id uuid,
  nome varchar,
  descricao text,
  preco_centavos integer,
  url_imagem text,
  url_imagem_thumb text,
  quantidade_estoque integer,
  ativo boolean
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb,
    p.quantidade_estoque, p.ativo
  from public.produtos p
  where p.nome ilike '%' || p_nome || '%'
  order by case
    when lower(p.nome) = lower(trim(p_nome)) then 0
    when lower(p.nome) like lower(trim(p_nome)) || '%' then 1
    else 2
  end, nullif(p.ordem_exibicao, 0) asc nulls last, p.nome asc, p.id asc
  limit 5;
$$;

revoke all on function public.buscar_produtos_disponiveis() from public;
revoke all on function public.buscar_produto_por_nome(text) from public;
grant execute on function public.buscar_produtos_disponiveis() to anon, authenticated, service_role;
grant execute on function public.buscar_produto_por_nome(text) to anon, authenticated, service_role;
