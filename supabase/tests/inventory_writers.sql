-- Transactional creation and adjustment contract. Runs only against disposable/local Supabase.
begin;
set local search_path = public, auth, extensions;
select plan(1);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
 raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
 ('44444444-4444-4444-8444-444444444441','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inventory-admin@example.test','',now(),'{}','{}',now(),now()),
 ('44444444-4444-4444-8444-444444444442','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inventory-supervisor@example.test','',now(),'{}','{}',now(),now()),
 ('44444444-4444-4444-8444-444444444443','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inventory-vendor@example.test','',now(),'{}','{}',now(),now()),
 ('44444444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inventory-inactive@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;
update public.perfis set ativo=id<>'44444444-4444-4444-8444-444444444444', funcao=case id
 when '44444444-4444-4444-8444-444444444441' then 'admin'::public.tipo_funcao
 when '44444444-4444-4444-8444-444444444442' then 'supervisor'::public.tipo_funcao
 else 'vendedor'::public.tipo_funcao end
where id::text like '44444444-4444-4444-8444-44444444444%';

set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444441',true);
do $$ declare r record; v_zero uuid; v_move uuid; v_product uuid; v_initial_move uuid; begin
 select * into r from public.criar_produto_com_estoque('Controlled positive',null,1000,7,2,true,'44444444-4444-4444-8444-444444444451');
 if r.quantidade_estoque<>7 or not r.ativo or r.movimentacao_id is null then raise exception 'invalid positive creation result'; end if;
 v_product:=r.produto_id; v_initial_move:=r.movimentacao_id;
 if (select count(*) from public.movimentacoes_estoque where produto_id=r.produto_id and tipo='entrada' and motivo='Estoque inicial'
     and quantidade_anterior=0 and quantidade_nova=7 and usuario_id=auth.uid())<>1 then raise exception 'invalid initial movement'; end if;
 if (select count(*) from public.logs_auditoria where acao='criar_produto_com_estoque' and detalhes->>'correlation_id'='44444444-4444-4444-8444-444444444451')<>1 then raise exception 'missing safe audit'; end if;
 perform * from public.ajustar_estoque_atomico(v_product,2,'entrada','later mutation');
 select * into r from public.criar_produto_com_estoque('Controlled positive',null,1000,7,2,true,'44444444-4444-4444-8444-444444444451');
 if r.produto_id<>v_product or r.movimentacao_id<>v_initial_move or r.quantidade_estoque<>7 or not r.ativo then raise exception 'creation replay changed original result'; end if;
 if (select count(*) from public.movimentacoes_estoque where produto_id=r.produto_id and correlation_id='44444444-4444-4444-8444-444444444451')<>1 then raise exception 'retry duplicated movement'; end if;
 begin perform * from public.criar_produto_com_estoque('Changed retry',null,1000,7,2,true,'44444444-4444-4444-8444-444444444451'); raise exception 'mismatched retry accepted';
 exception when unique_violation then null; end;

 select * into r from public.criar_produto_com_estoque('Controlled zero',null,1000,0,2,true,'44444444-4444-4444-8444-444444444452');
 if r.quantidade_estoque<>0 or r.ativo or r.movimentacao_id is not null then raise exception 'controlled-zero semantics changed'; end if;
 v_zero:=r.produto_id;
 select * into r from public.criar_produto_com_estoque('Uncontrolled zero',null,1000,0,2,false,'44444444-4444-4444-8444-444444444453');
 if r.quantidade_estoque<>0 or not r.ativo or r.movimentacao_id is not null then raise exception 'uncontrolled-zero semantics changed'; end if;
 begin perform * from public.criar_produto_com_estoque('Negative',null,1000,-1,2,true,'44444444-4444-4444-8444-444444444454'); raise exception 'negative creation accepted';
 exception when invalid_parameter_value then null; end;

 select * into r from public.ajustar_estoque_atomico(v_zero,3,'entrada','Reactivate','44444444-4444-4444-8444-444444444455',true);
 if r.qtd_nova<>3 or not r.produto_ativo then raise exception 'active-state coupling failed'; end if;
 v_move:=r.movimentacao_id;
 perform * from public.ajustar_estoque_atomico(v_zero,3,'saida','later mutation');
 select * into r from public.ajustar_estoque_atomico(v_zero,3,'entrada','Reactivate','44444444-4444-4444-8444-444444444455',true);
 if r.qtd_anterior<>0 or r.qtd_nova<>3 or r.movimentacao_id<>v_move or not r.produto_ativo then raise exception 'adjustment replay changed original result'; end if;
 begin perform * from public.ajustar_estoque_atomico(v_zero,4,'entrada','Reactivate','44444444-4444-4444-8444-444444444455',true); raise exception 'adjustment conflict accepted';
 exception when unique_violation then null; end;
 begin perform * from public.ajustar_estoque_atomico(v_zero,1,'saida','shortage','44444444-4444-4444-8444-444444444465',true); raise exception 'shortage accepted';
 exception when check_violation then null; end;
 if (select quantidade_estoque from public.produtos where id=v_zero)<>0 or exists(select 1 from public.movimentacoes_estoque where correlation_id='44444444-4444-4444-8444-444444444465') then raise exception 'shortage mutated state'; end if;
end $$;

reset role; set local role service_role;
select * from public.ajustar_estoque_atomico(
 (select id from public.produtos where creation_correlation_id='44444444-4444-4444-8444-444444444452'),1,'entrada','bridge compatibility','44444444-4444-4444-8444-444444444441');
reset role;
create temp table deleted_creation as select id from public.produtos where creation_correlation_id='44444444-4444-4444-8444-444444444451';
grant select on deleted_creation to authenticated;
delete from public.produtos where creation_correlation_id='44444444-4444-4444-8444-444444444451';
set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444441',true);
do $$ begin if (select produto_id from public.criar_produto_com_estoque('Controlled positive',null,1000,7,2,true,'44444444-4444-4444-8444-444444444451'))<>(select id from deleted_creation)
 then raise exception 'deleted creation retry duplicated product'; end if; end $$;
reset role;

-- Supervisor succeeds; vendor, inactive and anonymous callers cannot create.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444442',true);
do $$ begin perform * from public.criar_produto_com_estoque('Supervisor product',null,1000,0,1,false,'44444444-4444-4444-8444-444444444456'); end $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444443',true);
do $$ begin begin perform * from public.criar_produto_com_estoque('Vendor product',null,1000,1,1,true,'44444444-4444-4444-8444-444444444457'); raise exception 'vendor accepted'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ begin begin perform * from public.criar_produto_com_estoque('Inactive product',null,1000,1,1,true,'44444444-4444-4444-8444-444444444458'); raise exception 'inactive accepted'; exception when insufficient_privilege then null; end; end $$;
reset role; set local role anon;
do $$ begin begin perform * from public.criar_produto_com_estoque('Anonymous product',null,1000,1,1,true,'44444444-4444-4444-8444-444444444459'); raise exception 'anonymous accepted'; exception when insufficient_privilege then null; end; end $$;
reset role;

-- Persistence failures roll back the product as well as movement/audit side effects.
create function pg_temp.reject_inventory_write() returns trigger language plpgsql as $$ begin raise exception 'forced persistence failure'; end $$;
create trigger reject_inventory_movement before insert on public.movimentacoes_estoque for each row execute function pg_temp.reject_inventory_write();
set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444441',true);
do $$ begin begin perform * from public.criar_produto_com_estoque('Movement rollback',null,1000,1,1,true,'44444444-4444-4444-8444-444444444461'); exception when others then null; end; end $$;
reset role; drop trigger reject_inventory_movement on public.movimentacoes_estoque;
create trigger reject_inventory_audit before insert on public.logs_auditoria for each row execute function pg_temp.reject_inventory_write();
set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444441',true);
do $$ begin begin perform * from public.criar_produto_com_estoque('Audit rollback',null,1000,0,1,false,'44444444-4444-4444-8444-444444444462'); exception when others then null; end; end $$;
reset role;
do $$ begin
 if exists(select 1 from public.produtos where nome in ('Changed retry','Vendor product','Inactive product','Anonymous product','Negative','Movement rollback','Audit rollback')) then raise exception 'partial or unauthorized product persisted'; end if;
 if exists(select 1 from public.movimentacoes_estoque where quantidade_nova<0) then raise exception 'negative stock persisted'; end if;
end $$;
select pass('inventory writers authorize, serialize retries, preserve zero semantics, and roll back atomically');
select * from finish();
rollback;
