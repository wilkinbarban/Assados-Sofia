-- Expand-only inventory writers: authenticated actor, atomic movement/audit, safe retries.
alter table public.produtos add column if not exists creation_correlation_id uuid;
alter table public.movimentacoes_estoque add column if not exists correlation_id uuid;
create unique index if not exists produtos_creation_correlation_uidx on public.produtos(creation_correlation_id) where creation_correlation_id is not null;
create unique index if not exists movimentos_correlation_uidx on public.movimentacoes_estoque(correlation_id) where correlation_id is not null;
create table if not exists public.inventory_writer_idempotency(
 correlation_id uuid not null, operation text not null, request jsonb not null, result jsonb not null,
 primary key(correlation_id,operation));
alter table public.inventory_writer_idempotency enable row level security;
revoke all on public.inventory_writer_idempotency from public,anon,authenticated,service_role;

create function public.ajustar_estoque_atomico(
 p_produto_id uuid, p_quantidade integer, p_tipo public.tipo_movimentacao, p_motivo text,
 p_correlation_id uuid, p_idempotent boolean
) returns table(qtd_anterior integer,qtd_nova integer,movimentacao_id uuid,produto_ativo boolean)
language plpgsql security definer set search_path='' as $$
declare prod record; n integer; mid uuid; actor uuid:=auth.uid(); corr uuid; idem record; req jsonb;
begin
 if actor is null then raise exception using errcode='42501',message='USUARIO_NAO_AUTENTICADO'; end if;
 if not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then
  raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 if p_produto_id is null then raise exception using errcode='22023',message='PRODUTO_ID_OBRIGATORIO'; end if;
 if p_quantidade is null or p_quantidade<=0 then raise exception using errcode='22023',message='QUANTIDADE_INVALIDA'; end if;
 if p_tipo is null or p_tipo not in ('entrada','saida','ajuste','cancelamento') then raise exception using errcode='22023',message='TIPO_MOVIMENTACAO_INVALIDO'; end if;
 corr:=case when p_idempotent then p_correlation_id end;
 if p_idempotent and corr is null then raise exception using errcode='22023',message='CORRELATION_ID_INVALIDO'; end if;
 if corr is not null then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(corr::text,0));
  req:=jsonb_build_object('produto_id',p_produto_id,'quantidade',p_quantidade,'tipo',p_tipo,'motivo',nullif(p_motivo,''));
  select * into idem from public.inventory_writer_idempotency where correlation_id=corr and operation='adjustment';
  if found then
   if idem.request<>req then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
   qtd_anterior:=(idem.result->>'qtd_anterior')::integer; qtd_nova:=(idem.result->>'qtd_nova')::integer;
   movimentacao_id:=(idem.result->>'movimentacao_id')::uuid; produto_ativo:=(idem.result->>'produto_ativo')::boolean;
   return next; return;
  end if;
 end if;
 select id,quantidade_estoque,controlar_estoque,ativo into prod from public.produtos where id=p_produto_id for update;
 if not found then raise exception using errcode='P0002',message='PRODUTO_NAO_ENCONTRADO'; end if;
 n:=case when p_tipo in ('entrada','cancelamento') then prod.quantidade_estoque+p_quantidade
         when p_tipo='saida' then prod.quantidade_estoque-p_quantidade else p_quantidade end;
 if n<0 then raise exception using errcode='23514',message='ESTOQUE_INSUFICIENTE'; end if;
 produto_ativo:=case when prod.controlar_estoque then n>0 else prod.ativo end;
 update public.produtos set quantidade_estoque=n,ativo=produto_ativo,data_atualizacao=now() where id=p_produto_id;
 insert into public.movimentacoes_estoque(produto_id,tipo,quantidade,quantidade_anterior,quantidade_nova,motivo,usuario_id,correlation_id)
 values(p_produto_id,p_tipo,p_quantidade,prod.quantidade_estoque,n,nullif(p_motivo,''),actor,corr) returning id into mid;
 qtd_anterior:=prod.quantidade_estoque; qtd_nova:=n; movimentacao_id:=mid; return next;
 if corr is not null then insert into public.inventory_writer_idempotency values
  (corr,'adjustment',req,jsonb_build_object('qtd_anterior',qtd_anterior,'qtd_nova',qtd_nova,'movimentacao_id',mid,'produto_ativo',produto_ativo)); end if;
end $$;

create or replace function public.ajustar_estoque_atomico(
 p_produto_id uuid,p_quantidade integer,p_tipo public.tipo_movimentacao,p_motivo text default null
) returns table(qtd_anterior integer,qtd_nova integer,movimentacao_id uuid,produto_ativo boolean)
language sql security definer set search_path='' as $$
 select * from public.ajustar_estoque_atomico(p_produto_id,p_quantidade,p_tipo,p_motivo,null::uuid,false)
$$;

create function public.criar_produto_com_estoque(
 p_nome text,p_descricao text,p_preco_centavos integer,p_quantidade_estoque integer,p_estoque_minimo integer,
 p_controlar_estoque boolean,p_correlation_id uuid
) returns table(produto_id uuid,movimentacao_id uuid,quantidade_estoque integer,ativo boolean)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p public.produtos%rowtype; movement uuid; idem record; req jsonb;
begin
 if actor is null then raise exception using errcode='42501',message='USUARIO_NAO_AUTENTICADO'; end if;
 if not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then
  raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 if nullif(pg_catalog.btrim(p_nome),'') is null or p_preco_centavos<0 or p_quantidade_estoque<0 or p_estoque_minimo<0 or p_correlation_id is null then
  raise exception using errcode='22023',message='DADOS_INVALIDOS'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_correlation_id::text,0));
 req:=jsonb_build_object('nome',pg_catalog.btrim(p_nome),'descricao',p_descricao,'preco',p_preco_centavos,'quantidade',p_quantidade_estoque,'minimo',p_estoque_minimo,'controlar',p_controlar_estoque);
 select * into idem from public.inventory_writer_idempotency where correlation_id=p_correlation_id and operation='creation';
 if found then
  if idem.request<>req then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
  return query select (idem.result->>'produto_id')::uuid,(idem.result->>'movimentacao_id')::uuid,
   (idem.result->>'quantidade_estoque')::integer,(idem.result->>'ativo')::boolean; return;
 end if;
 insert into public.produtos(nome,descricao,preco_centavos,quantidade_estoque,estoque_minimo,controlar_estoque,ativo,creation_correlation_id)
 values(pg_catalog.btrim(p_nome),p_descricao,p_preco_centavos,0,p_estoque_minimo,p_controlar_estoque,not p_controlar_estoque,p_correlation_id)
 returning * into p;
 if p_quantidade_estoque>0 then
  select a.movimentacao_id,a.qtd_nova,a.produto_ativo into movement,p.quantidade_estoque,p.ativo
  from public.ajustar_estoque_atomico(p.id,p_quantidade_estoque,'entrada','Estoque inicial',p_correlation_id,true) a;
 end if;
 insert into public.logs_auditoria(usuario_id,acao,detalhes) values(actor,'criar_produto_com_estoque',
  jsonb_build_object('product_id',p.id,'movement_id',movement,'correlation_id',p_correlation_id));
 insert into public.inventory_writer_idempotency values(p_correlation_id,'creation',req,
  jsonb_build_object('produto_id',p.id,'movimentacao_id',movement,'quantidade_estoque',p.quantidade_estoque,'ativo',p.ativo));
 return query select p.id,movement,p.quantidade_estoque,p.ativo;
end $$;

revoke all on function public.ajustar_estoque_atomico(uuid,integer,public.tipo_movimentacao,text,uuid,boolean) from public,anon,service_role;
grant execute on function public.ajustar_estoque_atomico(uuid,integer,public.tipo_movimentacao,text,uuid,boolean) to authenticated;
revoke all on function public.criar_produto_com_estoque(text,text,integer,integer,integer,boolean,uuid) from public,anon,service_role;
grant execute on function public.criar_produto_com_estoque(text,text,integer,integer,integer,boolean,uuid) to authenticated;
comment on function public.criar_produto_com_estoque(text,text,integer,integer,integer,boolean,uuid) is
 'Creates one product and optional initial movement atomically for auth.uid(); correlation provides safe retries.';
