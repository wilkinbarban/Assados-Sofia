-- Disposable runtime verification for profile grants, RLS, RPCs, and atomic audit.
begin;
set local search_path = public, auth, extensions;
select plan(1);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
 raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
 ('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p-admin1@example.test','',now(),'{}','{}',now(),now()),
 ('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p-admin2@example.test','',now(),'{}','{}',now(),now()),
 ('33333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p-supervisor@example.test','',now(),'{}','{}',now(),now()),
 ('44444444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p-vendor@example.test','',now(),'{}','{"funcao":"admin"}',now(),now()),
 ('55555555-5555-4555-8555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p-inactive@example.test','',now(),'{}','{}',now(),now()),
 ('66666666-6666-4666-8666-666666666666','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p-target@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;
update public.perfis set nome = 'Profile fixture', funcao = case id
 when '11111111-1111-4111-8111-111111111111' then 'admin'::public.tipo_funcao
 when '22222222-2222-4222-8222-222222222222' then 'admin'::public.tipo_funcao
 when '33333333-3333-4333-8333-333333333333' then 'supervisor'::public.tipo_funcao
 else 'vendedor'::public.tipo_funcao end,
 ativo = id <> '55555555-5555-4555-8555-555555555555'
where id::text like any (array['11111111%','22222222%','33333333%','44444444%','55555555%','66666666%']);

set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ declare n integer; begin
 begin update public.perfis set funcao='admin' where id=auth.uid(); raise exception 'self role escalation succeeded'; exception when insufficient_privilege then null; end;
 begin update public.perfis set ativo=false where id=auth.uid(); raise exception 'self status mutation succeeded'; exception when insufficient_privilege then null; end;
 begin update public.perfis set nome='mixed',funcao='admin' where id=auth.uid(); raise exception 'mixed update succeeded'; exception when insufficient_privilege then null; end;
 update public.perfis set nome='cross-row' where id='66666666-6666-4666-8666-666666666666'; get diagnostics n=row_count;
 if n<>0 then raise exception 'cross-profile update succeeded'; end if;
 update public.perfis set nome='Safe self-service' where id=auth.uid(); get diagnostics n=row_count;
 if n<>1 then raise exception 'safe update failed'; end if;
end $$;

reset role;
do $$ begin
 if not exists(select 1 from public.logs_auditoria where usuario_id='44444444-4444-4444-8444-444444444444' and acao='perfil_self_service_updated') then raise exception 'safe update audit failed'; end if;
end $$;
set local role authenticated;

do $$ declare actor uuid; begin
 foreach actor in array array['44444444-4444-4444-8444-444444444444'::uuid,'55555555-5555-4555-8555-555555555555'::uuid] loop
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin perform public.gerenciar_funcao_status_perfil('66666666-6666-4666-8666-666666666666','supervisor',true); raise exception 'unauthorized managed update succeeded';
  exception when insufficient_privilege then null; end;
 end loop;
end $$;

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select public.gerenciar_funcao_status_perfil('66666666-6666-4666-8666-666666666666','cliente',true);
do $$ begin
 begin perform public.gerenciar_funcao_status_perfil('66666666-6666-4666-8666-666666666666','admin',true); raise exception 'supervisor promoted admin';
 exception when insufficient_privilege then null; end;
 begin perform public.gerenciar_funcao_status_perfil('22222222-2222-4222-8222-222222222222','supervisor',true); raise exception 'supervisor mutated admin';
 exception when insufficient_privilege then null; end;
  if not exists(select 1 from public.logs_auditoria where usuario_id=auth.uid() and acao='perfil_role_status_changed' and detalhes->>'target_id'='66666666-6666-4666-8666-666666666666') then raise exception 'session actor was not audited'; end if;
end $$;

do $$ begin
 begin insert into public.logs_auditoria(usuario_id,acao,detalhes) values
  ('11111111-1111-4111-8111-111111111111','spoofed','{}');
  raise exception 'direct audit insert succeeded';
 exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 begin perform public.gerenciar_funcao_status_perfil(auth.uid(),'vendedor',false); raise exception 'self-lockout succeeded'; exception when check_violation then null; end;
 perform public.gerenciar_funcao_status_perfil('22222222-2222-4222-8222-222222222222','supervisor',true);
 perform public.gerenciar_funcao_status_perfil('66666666-6666-4666-8666-666666666666','admin',true);
 if not exists(select 1 from public.logs_auditoria where usuario_id=auth.uid()
   and acao='perfil_role_status_changed' and detalhes->>'new_role'='admin') then
  raise exception 'admin promotion audit actor mismatch';
 end if;
 begin perform public.gerenciar_funcao_status_perfil('11111111-1111-4111-8111-111111111111','supervisor',true); raise exception 'last admin demotion succeeded'; exception when check_violation then null; end;
end $$;
reset role;

do $$ begin
 if has_function_privilege('anon','public.gerenciar_funcao_status_perfil(uuid,public.tipo_funcao,boolean)','execute') then raise exception 'anon can execute managed RPC'; end if;
 if has_column_privilege('anon','public.perfis','nome','update') then raise exception 'anon can update profiles'; end if;
 if has_table_privilege('authenticated','public.logs_auditoria','insert') or has_table_privilege('authenticated','public.logs_auditoria','update') or has_table_privilege('authenticated','public.logs_auditoria','delete') then raise exception 'audit is directly writable'; end if;
end $$;

create function pg_temp.reject_profile_audit() returns trigger language plpgsql as $$ begin
 if new.acao='perfil_role_status_changed' then raise exception 'forced audit failure'; end if; return new; end $$;
create trigger reject_profile_audit before insert on public.logs_auditoria for each row execute function pg_temp.reject_profile_audit();
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 begin perform public.gerenciar_funcao_status_perfil('66666666-6666-4666-8666-666666666666','vendedor',true); exception when others then null; end;
 if (select funcao from public.perfis where id='66666666-6666-4666-8666-666666666666')<>'admin' then raise exception 'audit failure did not roll back profile'; end if;
end $$;
select pass('profile grants, RLS, RPC authorization, audit, and rollback are hardened');
select * from finish();
rollback;
