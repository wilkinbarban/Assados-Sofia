-- Forward-only timing revision. Existing Telegram/WhatsApp producer and processing gates remain unchanged.
do $$
declare
  v_name text;
  v_signature regprocedure;
  v_definition text;
  v_revised text;
  v_old_replacements integer;
  v_new_replacements integer;
begin
  foreach v_name in array array[
    'public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz)',
    'public.attach_sofia_inbound_message(uuid,uuid,uuid,text)'
  ] loop
    v_signature := pg_catalog.to_regprocedure(v_name);
    if v_signature is null then
      raise exception using errcode = '55000', message = 'SOFIA_HUMANIZED_TIMING_SIGNATURE_MISSING';
    end if;

    select pg_catalog.pg_get_functiondef(p.oid)
      into strict v_definition
      from pg_catalog.pg_proc p
      where p.oid = v_signature;
    if not exists (
      select 1
      from pg_catalog.pg_proc p
      where p.oid = v_signature
        and p.prosecdef
        and (
          select count(*) = 1
             and bool_and(config in ('search_path=', 'search_path=""'))
          from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as config
          where config like 'search_path=%'
        )
        and pg_catalog.to_regrole('service_role') is not null
        and pg_catalog.to_regrole('anon') is not null
        and pg_catalog.to_regrole('authenticated') is not null
        and exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) privilege
          where privilege.grantee = pg_catalog.to_regrole('service_role')::oid
            and privilege.privilege_type = 'EXECUTE'
        )
        and not exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) privilege
          where privilege.grantee in (0, pg_catalog.to_regrole('anon')::oid, pg_catalog.to_regrole('authenticated')::oid)
            and privilege.privilege_type = 'EXECUTE'
        )
    ) then
      raise exception using errcode = '55000', message = 'SOFIA_HUMANIZED_TIMING_SECURITY_MISMATCH';
    end if;

    v_old_replacements := (length(v_definition) - length(pg_catalog.replace(v_definition, 'interval ''5 seconds''', ''))) / length('interval ''5 seconds''');
    v_new_replacements := (length(v_definition) - length(pg_catalog.replace(v_definition, 'interval ''10 seconds''', ''))) / length('interval ''10 seconds''');
    if v_old_replacements = 2 and v_new_replacements = 0 then
      v_revised := pg_catalog.replace(v_definition, 'interval ''5 seconds''', 'interval ''10 seconds''');
      execute v_revised;
    elsif v_old_replacements = 0 and v_new_replacements = 2 then
      null;
    else
      raise exception using errcode = '55000', message = 'SOFIA_HUMANIZED_TIMING_SOURCE_MISMATCH';
    end if;

    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_signature
        and p.prosecdef
        and (
          select count(*) = 1
             and bool_and(config in ('search_path=', 'search_path=""'))
          from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as config
          where config like 'search_path=%'
        )
        and pg_catalog.to_regrole('service_role') is not null
        and pg_catalog.to_regrole('anon') is not null
        and pg_catalog.to_regrole('authenticated') is not null
        and exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) privilege
          where privilege.grantee = pg_catalog.to_regrole('service_role')::oid
            and privilege.privilege_type = 'EXECUTE'
        )
        and not exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) privilege
          where privilege.grantee in (0, pg_catalog.to_regrole('anon')::oid, pg_catalog.to_regrole('authenticated')::oid)
            and privilege.privilege_type = 'EXECUTE'
        )
    ) then
      raise exception using errcode = '55000', message = 'SOFIA_HUMANIZED_TIMING_SECURITY_MISMATCH';
    end if;
  end loop;
end
$$;
