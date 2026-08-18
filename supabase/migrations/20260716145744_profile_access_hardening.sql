-- Column-safe profile self-service and session-bound managed role/status changes.
drop policy if exists "Alteração de perfis própria ou por admin" on public.perfis;
drop policy if exists "Profile owners update approved columns" on public.perfis;
create policy "Profile owners update approved columns" on public.perfis
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
grant update (nome) on public.perfis to authenticated;
drop policy if exists "Inserção de logs por admin e supervisor" on public.logs_auditoria;
revoke insert, update, delete, truncate on public.logs_auditoria from public, anon, authenticated;

create or replace function public.audit_profile_self_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if new.nome is distinct from old.nome then
    if v_actor is null then return new; end if;
    if v_actor <> old.id then
      raise insufficient_privilege using message = 'PROFILE_SELF_SERVICE_DENIED';
    end if;
    insert into public.logs_auditoria (usuario_id, acao, detalhes)
    values (v_actor, 'perfil_self_service_updated',
      jsonb_build_object('target_id', old.id, 'changed_columns', jsonb_build_array('nome')));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_profile_self_service on public.perfis;
create trigger audit_profile_self_service
after update of nome on public.perfis
for each row execute function public.audit_profile_self_service();

create or replace function public.atualizar_nome_perfil(p_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise insufficient_privilege using message = 'USUARIO_NAO_AUTENTICADO'; end if;
  if nullif(btrim(p_nome), '') is null or length(btrim(p_nome)) > 100 then
    raise check_violation using message = 'NOME_INVALIDO';
  end if;
  update public.perfis set nome = btrim(p_nome)
  where id = v_actor and ativo and funcao in ('admin','supervisor','vendedor');
  if not found then raise insufficient_privilege using message = 'PERFIL_NAO_AUTORIZADO'; end if;
end;
$$;

create or replace function public.gerenciar_funcao_status_perfil(
  p_usuario_alvo_id uuid, p_funcao public.tipo_funcao, p_ativo boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role public.tipo_funcao;
  v_target public.perfis%rowtype;
  v_active_admins integer;
begin
  if v_actor is null then raise insufficient_privilege using message = 'USUARIO_NAO_AUTENTICADO'; end if;
  -- Serialize managed changes, then lock actor and target before authorization.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('profile-access-management'));
  perform 1 from public.perfis
    where id in (v_actor, p_usuario_alvo_id) order by id for update;
  select funcao into v_actor_role from public.perfis
    where id=v_actor and ativo and funcao in ('admin','supervisor');
  if not found then
    raise insufficient_privilege using message = 'USUARIO_NAO_AUTORIZADO';
  end if;
  if v_actor = p_usuario_alvo_id then raise check_violation using message = 'ANTI_LOCKOUT'; end if;

  perform 1 from public.perfis where funcao='admin' and ativo order by id for update;
  select * into v_target from public.perfis where id=p_usuario_alvo_id;
  if not found then raise no_data_found using message = 'PERFIL_ALVO_NAO_ENCONTRADO'; end if;
  if v_actor_role <> 'admin' and (
    p_funcao not in ('vendedor','cliente') or v_target.funcao not in ('vendedor','cliente')
  ) then
    raise insufficient_privilege using message = 'HIERARQUIA_PERFIL_NEGADA';
  end if;
  if v_target.funcao='admin' and v_target.ativo and (p_funcao<>'admin' or not p_ativo) then
    select count(*) into v_active_admins from public.perfis where funcao='admin' and ativo;
    if v_active_admins <= 1 then raise check_violation using message = 'MINIMO_UM_ADMIN_ATIVO'; end if;
  end if;

  update public.perfis set funcao=p_funcao, ativo=p_ativo where id=p_usuario_alvo_id;
  insert into public.logs_auditoria (usuario_id, acao, detalhes) values
    (v_actor, 'perfil_role_status_changed', jsonb_build_object(
      'target_id', p_usuario_alvo_id, 'previous_role', v_target.funcao,
      'new_role', p_funcao, 'previous_active', v_target.ativo, 'new_active', p_ativo));
end;
$$;

revoke execute on function public.audit_profile_self_service() from public, anon, authenticated, service_role;
revoke execute on function public.atualizar_nome_perfil(text) from public, anon, service_role;
revoke execute on function public.gerenciar_funcao_status_perfil(uuid,public.tipo_funcao,boolean) from public, anon, service_role;
grant execute on function public.atualizar_nome_perfil(text) to authenticated;
grant execute on function public.gerenciar_funcao_status_perfil(uuid,public.tipo_funcao,boolean) to authenticated;
