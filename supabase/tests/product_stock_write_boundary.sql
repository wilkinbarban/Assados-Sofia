-- Disposable verification for column-safe product metadata updates.
begin;
set local search_path = public, auth, extensions;
select plan(1);

insert into public.produtos (id, nome, preco_centavos, quantidade_estoque, estoque_minimo, controlar_estoque, ativo)
values ('77777777-7777-4777-8777-777777777777', 'Boundary product', 1000, 10, 2, true, true);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
 raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
 ('77777777-7777-4777-8777-777777777771','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stock-admin@example.test','',now(),'{}','{}',now(),now()),
 ('77777777-7777-4777-8777-777777777772','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stock-vendor@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;
update public.perfis set nome='Stock boundary fixture', ativo=true,
 funcao=case id when '77777777-7777-4777-8777-777777777771' then 'admin'::public.tipo_funcao else 'vendedor'::public.tipo_funcao end
where id in ('77777777-7777-4777-8777-777777777771','77777777-7777-4777-8777-777777777772');

set local role authenticated;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777771',true);
do $$ declare n integer; begin
 begin update public.produtos set quantidade_estoque=99 where id='77777777-7777-4777-8777-777777777777'; raise exception 'direct stock update succeeded'; exception when insufficient_privilege then null; end;
 begin update public.produtos set nome='Partial',quantidade_estoque=99 where id='77777777-7777-4777-8777-777777777777'; raise exception 'mixed update succeeded'; exception when insufficient_privilege then null; end;
 update public.produtos set nome='Metadata updated',descricao='Allowed',preco_centavos=1250 where id='77777777-7777-4777-8777-777777777777';
 get diagnostics n=row_count; if n<>1 then raise exception 'authorized metadata update failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777772',true);
do $$ declare n integer; begin
 update public.produtos set nome='Vendor edit' where id='77777777-7777-4777-8777-777777777777';
 get diagnostics n=row_count; if n<>0 then raise exception 'vendor metadata update succeeded'; end if;
end $$;
reset role;
do $$ begin
 if (select nome from public.produtos where id='77777777-7777-4777-8777-777777777777')<>'Metadata updated' then raise exception 'metadata update missing or partially overwritten'; end if;
 if (select quantidade_estoque from public.produtos where id='77777777-7777-4777-8777-777777777777')<>10 then raise exception 'stock changed through generic update'; end if;
 if exists(select 1 from public.movimentacoes_estoque where produto_id='77777777-7777-4777-8777-777777777777') then raise exception 'denied update created movement'; end if;
 if has_column_privilege('authenticated','public.produtos','quantidade_estoque','update') then raise exception 'authenticated can update stock column'; end if;
end $$;
select pass('generic metadata edits work while stock, mixed, and unauthorized writes fail atomically');
select * from finish();
rollback;
