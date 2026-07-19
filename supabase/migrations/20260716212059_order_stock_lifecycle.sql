-- Expand-only atomic order stock lifecycle. Existing order columns and callers remain valid.
alter table public.pedidos add column if not exists estoque_estado text not null default 'pendente'
 check (estoque_estado in ('pendente','aplicado','restaurado'));
alter table public.pedidos add column if not exists estoque_confirmacao_correlation uuid;
alter table public.pedidos add column if not exists estoque_cancelamento_correlation uuid;
create table public.pedido_estoque_efeitos(
 pedido_id uuid not null references public.pedidos(id),produto_id uuid not null references public.produtos(id),
 quantidade integer not null check(quantidade>0),controlar_estoque boolean not null,primary key(pedido_id,produto_id)
);
create table public.pedido_estoque_snapshots(
 pedido_id uuid primary key references public.pedidos(id),efeitos jsonb not null check(jsonb_typeof(efeitos)='array')
);
alter table public.pedido_estoque_efeitos enable row level security;
alter table public.pedido_estoque_snapshots enable row level security;
revoke all on table public.pedido_estoque_efeitos from public,anon,authenticated,service_role;
revoke all on table public.pedido_estoque_snapshots from public,anon,authenticated,service_role;
insert into public.pedido_estoque_efeitos(pedido_id,produto_id,quantidade,controlar_estoque)
select i.pedido_id,i.produto_id,sum(i.quantidade)::integer,p.controlar_estoque from public.itens_pedido i
join public.pedidos o on o.id=i.pedido_id join public.produtos p on p.id=i.produto_id where o.status='confirmado'
group by i.pedido_id,i.produto_id,p.controlar_estoque;
insert into public.pedido_estoque_snapshots(pedido_id,efeitos)
select p.id,coalesce(jsonb_agg(jsonb_build_object('produto_id',e.produto_id,'quantidade',e.quantidade,'controlar_estoque',e.controlar_estoque)
 order by e.produto_id) filter(where e.produto_id is not null),'[]'::jsonb)
from public.pedidos p left join public.pedido_estoque_efeitos e on e.pedido_id=p.id where p.status='confirmado' group by p.id;
update public.pedidos set estoque_estado='aplicado' where status='confirmado' and estoque_estado='pendente';
create unique index if not exists movimentos_pedido_produto_tipo_uidx
 on public.movimentacoes_estoque(pedido_id,produto_id,tipo) where pedido_id is not null and tipo in ('saida','cancelamento');
revoke insert,update,delete on public.movimentacoes_estoque from anon,authenticated;

create function public.processar_pedido_estoque(p_pedido_id uuid,p_correlation_id uuid,p_cancelar boolean)
returns table(estado text,correlation_id uuid,actor_id uuid,origem text)
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); source text:='actor'; ord record; item record; expected integer; locked integer:=0; snapshot jsonb; actual jsonb;
begin
 if p_pedido_id is null or p_correlation_id is null then
  raise exception using errcode='22023',message='DADOS_INVALIDOS';
 end if;
 if actor is null then
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception using errcode='42501',message='USUARIO_NAO_AUTENTICADO'; end if;
  source:='system';
 elsif not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]) then
  raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';
 end if;
 select id,status,estoque_estado,estoque_confirmacao_correlation,estoque_cancelamento_correlation into ord
 from public.pedidos where id=p_pedido_id for update;
 if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO'; end if;
 if ord.estoque_estado='aplicado' then
  select s.efeitos into snapshot from public.pedido_estoque_snapshots s where s.pedido_id=p_pedido_id;
  select coalesce(jsonb_agg(jsonb_build_object('produto_id',e.produto_id,'quantidade',e.quantidade,'controlar_estoque',e.controlar_estoque)
   order by e.produto_id),'[]'::jsonb) into actual from public.pedido_estoque_efeitos e where e.pedido_id=p_pedido_id;
  if snapshot is null or snapshot is distinct from actual then raise exception using errcode='23514',message='EFEITOS_ESTOQUE_INDISPONIVEIS'; end if;
 end if;

 if p_cancelar then
  if ord.estoque_estado='restaurado' then
   if ord.estoque_cancelamento_correlation<>p_correlation_id then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
   return query select 'restaurado',p_correlation_id,actor,source; return;
  end if;
  if ord.estoque_estado<>'aplicado' then raise exception using errcode='23514',message='CANCELAMENTO_SEM_CONFIRMACAO'; end if;
 else
  if ord.estoque_estado='aplicado' then
   if ord.estoque_confirmacao_correlation is not null and ord.estoque_confirmacao_correlation<>p_correlation_id then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
   return query select 'aplicado',p_correlation_id,actor,source; return;
  end if;
  if ord.estoque_estado<>'pendente' or ord.status not in ('novo','confirmado') then raise exception using errcode='23514',message='TRANSICAO_PEDIDO_INVALIDA'; end if;
 end if;

 if not p_cancelar then
  perform 1 from public.itens_pedido where pedido_id=p_pedido_id order by produto_id,id for update;
  perform 1 from public.produtos p join (select distinct produto_id from public.itens_pedido where pedido_id=p_pedido_id) i
   on i.produto_id=p.id order by p.id for update of p;
  insert into public.pedido_estoque_efeitos(pedido_id,produto_id,quantidade,controlar_estoque)
  select p_pedido_id,i.produto_id,sum(i.quantidade)::integer,p.controlar_estoque from public.itens_pedido i
  join public.produtos p on p.id=i.produto_id where i.pedido_id=p_pedido_id group by i.produto_id,p.controlar_estoque;
 end if;
 select count(*) into expected from public.pedido_estoque_efeitos where pedido_id=p_pedido_id;
 if not p_cancelar and expected=0 then raise exception using errcode='23514',message='PEDIDO_SEM_ITENS'; end if;
 if not p_cancelar then
  insert into public.pedido_estoque_snapshots(pedido_id,efeitos)
  select p_pedido_id,jsonb_agg(jsonb_build_object('produto_id',produto_id,'quantidade',quantidade,'controlar_estoque',controlar_estoque)
   order by produto_id) from public.pedido_estoque_efeitos where pedido_id=p_pedido_id;
 end if;
 for item in
  select p.id,p.quantidade_estoque,i.controlar_estoque,i.quantidade from public.produtos p
  join public.pedido_estoque_efeitos i on i.produto_id=p.id and i.pedido_id=p_pedido_id
  order by p.id
 loop
  locked:=locked+1;
  if not p_cancelar and item.controlar_estoque and item.quantidade_estoque<item.quantidade then
   raise exception using errcode='23514',message='ESTOQUE_INSUFICIENTE';
  end if;
 end loop;
 if locked<>expected then raise exception using errcode='P0002',message='PRODUTO_NAO_ENCONTRADO'; end if;

 for item in
  select p.id,p.quantidade_estoque,i.controlar_estoque,i.quantidade from public.produtos p
  join public.pedido_estoque_efeitos i on i.produto_id=p.id and i.pedido_id=p_pedido_id
  order by p.id
 loop
  if item.controlar_estoque then
   update public.produtos set quantidade_estoque=case when p_cancelar then item.quantidade_estoque+item.quantidade else item.quantidade_estoque-item.quantidade end,
    data_atualizacao=now() where id=item.id;
   insert into public.movimentacoes_estoque(produto_id,tipo,quantidade,quantidade_anterior,quantidade_nova,motivo,usuario_id,pedido_id)
   values(item.id,case when p_cancelar then 'cancelamento'::public.tipo_movimentacao else 'saida'::public.tipo_movimentacao end,item.quantidade,
    item.quantidade_estoque,case when p_cancelar then item.quantidade_estoque+item.quantidade else item.quantidade_estoque-item.quantidade end,
    case when p_cancelar then 'Pedido cancelado' else 'Venda confirmada' end,actor,p_pedido_id);
  end if;
 end loop;
 update public.pedidos set status=case when p_cancelar then 'cancelado'::public.status_pedido else 'confirmado'::public.status_pedido end,
  estoque_estado=case when p_cancelar then 'restaurado' else 'aplicado' end,
  estoque_confirmacao_correlation=case when p_cancelar then estoque_confirmacao_correlation else p_correlation_id end,
  estoque_cancelamento_correlation=case when p_cancelar then p_correlation_id else estoque_cancelamento_correlation end where id=p_pedido_id;
 insert into public.logs_auditoria(usuario_id,acao,detalhes) values(actor,case when p_cancelar then 'cancelar_pedido_estoque' else 'confirmar_pedido_estoque' end,
  jsonb_build_object('pedido_id',p_pedido_id,'correlation_id',p_correlation_id,'origin',source));
 estado:=case when p_cancelar then 'restaurado' else 'aplicado' end; correlation_id:=p_correlation_id; actor_id:=actor; origem:=source; return next;
end $$;

create function public.confirmar_pedido_estoque(p_pedido_id uuid,p_correlation_id uuid)
returns table(estado text,correlation_id uuid,actor_id uuid,origem text) language sql security definer set search_path=''
as $$ select * from public.processar_pedido_estoque(p_pedido_id,p_correlation_id,false) $$;
create function public.cancelar_pedido_estoque(p_pedido_id uuid,p_correlation_id uuid)
returns table(estado text,correlation_id uuid,actor_id uuid,origem text) language sql security definer set search_path=''
as $$ select * from public.processar_pedido_estoque(p_pedido_id,p_correlation_id,true) $$;
revoke all on function public.processar_pedido_estoque(uuid,uuid,boolean),public.confirmar_pedido_estoque(uuid,uuid),public.cancelar_pedido_estoque(uuid,uuid) from public,anon;
revoke all on function public.processar_pedido_estoque(uuid,uuid,boolean) from authenticated,service_role;
grant execute on function public.confirmar_pedido_estoque(uuid,uuid),public.cancelar_pedido_estoque(uuid,uuid) to authenticated,service_role;
