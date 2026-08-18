-- Runtime verification script for the authenticated inventory RPC replacement.
-- Intended for local Supabase/Postgres after migrations and seed data are loaded.
-- Run inside a disposable database/session. The transaction rolls back all test data.

begin;

set local search_path = public, auth, extensions;
select plan(1);

insert into public.produtos (
  id,
  nome,
  descricao,
  preco_centavos,
  ativo,
  quantidade_estoque,
  estoque_minimo,
  controlar_estoque,
  ordem_exibicao
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Inventory hardening test product',
  'Temporary product for RPC verification',
  1000,
  true,
  10,
  1,
  true,
  0
);

-- The test fixture users are created in the local Auth schema only.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-supervisor@example.test', '', now(), '{}', '{}', now(), now()),
  ('c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-inactive@example.test', '', now(), '{}', '{}', now(), now()),
  ('d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-vendor@example.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.perfis (id, nome, funcao, ativo) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Inventory Admin', 'admin', true),
  ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'Inventory Supervisor', 'supervisor', true),
  ('c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'Inventory Inactive Admin', 'admin', false),
  ('d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4', 'Inventory Vendor', 'vendedor', true)
on conflict (id) do update
set nome = excluded.nome,
    funcao = excluded.funcao,
    ativo = excluded.ativo;

-- Seed an object as the migration owner. The later probes switch to API roles
-- and assert that only active administrators/supervisors can mutate it.
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'produto-imagens',
  'runtime-hardening/public-read.webp',
  'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
  '{"seed":"storage-policy"}'::jsonb
)
on conflict (bucket_id, name) do update
set metadata = excluded.metadata;

-- Anon must not receive execute privileges and an absent session must fail in the function.
do $$
begin
  if exists (
    select 1
    from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute the legacy rollback bridge';
  end if;

  if has_function_privilege(
    'anon',
    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)',
    'EXECUTE'
  ) then
    raise exception 'anon must not be able to execute ajustar_estoque_atomico';
  end if;

  -- This must reject any authenticated EXECUTE grant on the legacy bridge.
  if has_function_privilege(
    'authenticated',
    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)',
    'EXECUTE'
  ) then
    raise exception 'normal clients must not execute the legacy rollback bridge';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role must retain the legacy rollback bridge';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)',
    'EXECUTE'
  ) then
    raise exception 'the four-argument RPC must remain the authenticated-only official path';
  end if;
end;
$$;

set local role service_role;
do $$
declare
  v_result record;
begin
  if current_setting('request.jwt.claim.sub', true) is not null then
    raise exception 'service_role bridge verification requires no caller JWT';
  end if;

  select * into v_result from public.ajustar_estoque_atomico(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 10, 'ajuste'::public.tipo_movimentacao,
    'rollback bridge verification', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
  );
  if v_result.qtd_nova <> 10 then
    raise exception 'legacy rollback bridge did not delegate to the official RPC';
  end if;

end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  begin
    perform * from public.ajustar_estoque_atomico(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'entrada'::public.tipo_movimentacao, 'missing session verification'
    );
    raise exception 'expected missing session rejection was not raised';
  exception when insufficient_privilege then
    if sqlerrm not like '%USUARIO_NAO_AUTENTICADO%' then raise; end if;
  end;
end;
$$;

-- Unauthorized and inactive callers must leave stock and movement rows unchanged.
do $$
declare
  v_before integer;
  v_after integer;
  v_unauthorized_actor uuid;
begin
  select quantidade_estoque into v_before from public.produtos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  foreach v_unauthorized_actor in array array['c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'::uuid, 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'::uuid] loop
    perform set_config('request.jwt.claim.sub', v_unauthorized_actor::text, true);
    begin
      perform * from public.ajustar_estoque_atomico(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'entrada'::public.tipo_movimentacao, 'unauthorized verification'
      );
      raise exception 'expected unauthorized rejection was not raised';
    exception when insufficient_privilege then
      if sqlerrm not like '%USUARIO_NAO_AUTORIZADO%' then raise; end if;
    end;
  end loop;
  select quantidade_estoque into v_after from public.produtos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if v_after <> v_before then raise exception 'unauthorized callers changed stock'; end if;
end;
$$;

-- Direct table DML must not forge movements or bypass the atomic RPC, even for
-- an active vendor, an inactive admin, or an authenticated identity without a profile.
do $$
declare
  v_stock_before integer;
  v_stock_after integer;
  v_movements_before integer;
  v_movements_after integer;
  v_actor uuid;
  v_rows integer;
begin
  -- Count through the same active admin identity on both sides of the probes.
  -- Each probe changes the JWT subject, and movement RLS deliberately filters
  -- rows for the final unprofiled identity.
  perform set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);

  select quantidade_estoque into v_stock_before
  from public.produtos
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into v_movements_before
  from public.movimentacoes_estoque
  where produto_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  foreach v_actor in array array[
    'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'::uuid,
    'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'::uuid,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_actor::text, true);

    begin
      insert into public.movimentacoes_estoque (
        produto_id, tipo, quantidade, quantidade_anterior, quantidade_nova, motivo, usuario_id
      ) values (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'entrada'::public.tipo_movimentacao,
        1,
        v_stock_before,
        v_stock_before + 1,
        'forged direct movement',
        'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
      );
      raise exception 'direct movement insert unexpectedly succeeded for %', v_actor;
    exception when insufficient_privilege then
      null;
    end;

    begin
      update public.produtos
      set quantidade_estoque = quantidade_estoque + 1
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      get diagnostics v_rows = row_count;
      if v_rows <> 0 then
        raise exception 'direct product update unexpectedly succeeded for %', v_actor;
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);

  select quantidade_estoque into v_stock_after
  from public.produtos
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into v_movements_after
  from public.movimentacoes_estoque
  where produto_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  if v_stock_after <> v_stock_before or v_movements_after <> v_movements_before then
    raise exception 'direct table DML changed protected inventory state';
  end if;
end;
$$;

-- Storage is public-readable, but active vendor, inactive admin, and unknown
-- authenticated identities must not mutate produto-imagens objects.
do $$
declare
  v_actor uuid;
  v_rows integer;
  v_name text;
begin
  foreach v_actor in array array[
    'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'::uuid,
    'c3c3c3c3-c3c3-4c3c-c3c3c3c3c3c3c3c3'::uuid,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    v_name := format('runtime-hardening/denied-%s.webp', v_actor);

    begin
      insert into storage.objects (bucket_id, name, owner_id, metadata)
      values ('produto-imagens', v_name, v_actor::text, '{"attempt":"insert"}'::jsonb);
      raise exception 'storage insert unexpectedly succeeded for %', v_actor;
    exception when insufficient_privilege then
      null;
    end;

    update storage.objects
    set metadata = jsonb_build_object('attempt', 'update', 'actor', v_actor::text)
    where bucket_id = 'produto-imagens'
      and name = 'runtime-hardening/public-read.webp';
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'storage update unexpectedly succeeded for %', v_actor;
    end if;

    -- The local Storage schema blocks direct SQL deletion before RLS. This
    -- session-local flag mirrors the Storage API's delete path so the probe
    -- can observe the policy boundary rather than the protective trigger.
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'produto-imagens'
      and name = 'runtime-hardening/public-read.webp';
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'storage delete unexpectedly succeeded for %', v_actor;
    end if;
  end loop;
end;
$$;

-- Active admin and supervisor retain the session-bound upload, update, and
-- cleanup capability that Slice 2 will call through the authenticated client.
do $$
declare
  v_actor uuid;
  v_rows integer;
  v_name text;
begin
  foreach v_actor in array array[
    'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
    'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    v_name := format('runtime-hardening/allowed-%s.webp', v_actor);

    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('produto-imagens', v_name, v_actor::text, '{"operation":"insert"}'::jsonb);

    update storage.objects
    set metadata = jsonb_build_object('operation', 'update', 'actor', v_actor::text)
    where bucket_id = 'produto-imagens' and name = v_name;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'storage update did not affect the admin/supervisor object for %', v_actor;
    end if;

    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'produto-imagens' and name = v_name;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'storage delete did not affect the admin/supervisor object for %', v_actor;
    end if;
  end loop;
end;
$$;

reset role;
set local role anon;
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows
  from storage.objects
  where bucket_id = 'produto-imagens'
    and name = 'runtime-hardening/public-read.webp';

  if v_rows <> 1 then
    raise exception 'public produto-imagens read behavior regressed';
  end if;
end;
$$;
reset role;

-- Success path: actor comes from auth.uid(), never an input argument.
select set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);
do $$
declare
  v_result record;
  v_stock integer;
  v_movements integer;
begin
  select * into v_result
  from public.ajustar_estoque_atomico(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    5,
    'entrada'::public.tipo_movimentacao,
    'runtime success verification'
  );

  if v_result.qtd_anterior <> 10 or v_result.qtd_nova <> 15 then
    raise exception 'unexpected success quantities: %, %', v_result.qtd_anterior, v_result.qtd_nova;
  end if;

  select quantidade_estoque into v_stock
  from public.produtos
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into v_movements
  from public.movimentacoes_estoque
  where id = v_result.movimentacao_id
    and produto_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and tipo = 'entrada'::public.tipo_movimentacao
    and quantidade_anterior = 10
    and quantidade_nova = 15
    and usuario_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';

  if v_stock <> 15 or v_movements <> 1 then
    raise exception 'stock and movement were not written together';
  end if;
end;
$$;

-- Active supervisor is authorized too.
select set_config('request.jwt.claim.sub', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', true);
do $$
declare
  v_result record;
begin
  select * into v_result
  from public.ajustar_estoque_atomico(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    2,
    'cancelamento'::public.tipo_movimentacao,
    'runtime cancelamento verification'
  );

  if v_result.qtd_anterior <> 15 or v_result.qtd_nova <> 17 then
    raise exception 'cancelamento did not add stock as expected';
  end if;
end;
$$;

-- Insufficient stock path: writes neither product change nor movement.
do $$
declare
  v_stock_before integer;
  v_stock_after integer;
  v_movements_before integer;
  v_movements_after integer;
begin
  select quantidade_estoque into v_stock_before
  from public.produtos
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into v_movements_before
  from public.movimentacoes_estoque
  where produto_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  begin
    perform *
    from public.ajustar_estoque_atomico(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      999,
      'saida'::public.tipo_movimentacao,
      'runtime insufficient stock verification'
    );
    raise exception 'expected insufficient stock exception was not raised';
  exception
    when check_violation then
      if sqlerrm not like '%ESTOQUE_INSUFICIENTE%' then
        raise;
      end if;
  end;

  select quantidade_estoque into v_stock_after
  from public.produtos
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into v_movements_after
  from public.movimentacoes_estoque
  where produto_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  if v_stock_after <> v_stock_before or v_movements_after <> v_movements_before then
    raise exception 'insufficient stock path wrote product or movement rows';
  end if;
end;
$$;

-- Forced movement failure path: FK failure in movement insert rolls back prior product update.
do $$
declare
  v_stock_before integer;
  v_stock_after integer;
  v_movements_before integer;
  v_movements_after integer;
begin
  select quantidade_estoque into v_stock_before
  from public.produtos
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into v_movements_before
  from public.movimentacoes_estoque
  where produto_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  begin
    -- A valid session makes the insert valid; verify the function's transaction boundary
    -- by forcing a caller-side exception after invocation and rolling back the subtransaction.
    perform * from public.ajustar_estoque_atomico(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'entrada'::public.tipo_movimentacao, 'runtime rollback verification'
    );
    raise exception using errcode = 'P0001', message = 'force subtransaction rollback';
  exception when raise_exception then
    if sqlerrm not like '%force subtransaction rollback%' then raise; end if;
  end;

  select quantidade_estoque into v_stock_after
  from public.produtos
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into v_movements_after
  from public.movimentacoes_estoque
  where produto_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  if v_stock_after <> v_stock_before or v_movements_after <> v_movements_before then
    raise exception 'movement failure did not roll back product update';
  end if;
end;
$$;

reset role;

select pass('authenticated inventory RPC is authorized, atomic, and storage-safe');
select * from finish();
rollback;
