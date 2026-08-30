-- Forward runtime corrections found by the disposable authenticated harness.
create or replace function public.anonymizar_usuario_admin(p_usuario_alvo_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_target public.perfis%rowtype; v_remaining_admins integer; v_anonymized_phone varchar(20); v_attempt integer:=0;
begin
 if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 if v_actor=p_usuario_alvo_id then raise exception using errcode='42501',message='ANTI_LOCKOUT_AUTO_EXCLUSAO'; end if;
 select * into v_target from public.perfis where id=p_usuario_alvo_id for update;
 if not found then raise exception using errcode='P0002',message='PERFIL_ALVO_NAO_ENCONTRADO'; end if;
 if v_target.deletion_requested_at is not null then return; end if;
 if v_target.funcao='admin' and v_target.ativo then
   perform 1 from public.perfis where funcao='admin' and ativo order by id for update;
   select count(*) into v_remaining_admins from public.perfis where funcao='admin' and ativo and id<>p_usuario_alvo_id;
   if v_remaining_admins<1 then raise exception using errcode='42501',message='MINIMO_UM_ADMIN_ATIVO'; end if;
 end if;
 loop v_attempt:=v_attempt+1;if v_attempt>100 then raise exception using errcode='54000',message='ANONYMIZED_PHONE_NAMESPACE_EXHAUSTED';end if;v_anonymized_phone:='55419'||lpad(nextval('public.deleted_customer_phone_sequence')::text,8,'0');exit when not exists(select 1 from public.clientes where telefone=v_anonymized_phone);end loop;
 update public.clientes set usuario_id=null,nome='Deleted customer',telefone=v_anonymized_phone,email=null,telegram_chat_id=null where usuario_id=p_usuario_alvo_id;
 update public.perfis set ativo=false,deletion_requested_at=now(),auth_delete_completed_at=null where id=p_usuario_alvo_id;
 insert into public.logs_auditoria(usuario_id,acao,detalhes) values(v_actor,'anonymizar_usuario',jsonb_build_object('usuario_alvo_id',p_usuario_alvo_id,'auth_delete_pending',true));
end $$;

create or replace function public.iniciar_purga_total_usuario_admin(p_usuario_alvo_id uuid)
returns table(job_id uuid,bucket_id text,object_path text)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.perfis%rowtype; remaining_admins integer; job public.admin_user_deletion_jobs%rowtype;
begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 if actor=p_usuario_alvo_id then raise exception using errcode='42501',message='ANTI_LOCKOUT_AUTO_EXCLUSAO'; end if;
 select * into target from public.perfis where id=p_usuario_alvo_id for update;if not found then raise exception using errcode='P0002',message='PERFIL_ALVO_NAO_ENCONTRADO';end if;
 if target.funcao='admin' and target.ativo then perform 1 from public.perfis where funcao='admin' and ativo order by id for update;select count(*) into remaining_admins from public.perfis where funcao='admin' and ativo and id<>p_usuario_alvo_id;if remaining_admins<1 then raise exception using errcode='42501',message='MINIMO_UM_ADMIN_ATIVO';end if;end if;
 insert into public.admin_user_deletion_jobs(target_user_id,actor_id,mode,status)values(p_usuario_alvo_id,actor,'purge','storage_pending') on conflict(target_user_id,mode)do update set updated_at=now(),attempts=public.admin_user_deletion_jobs.attempts+1,last_error=null where public.admin_user_deletion_jobs.status<>'completed' returning * into job;
 if not found then select * into job from public.admin_user_deletion_jobs where target_user_id=p_usuario_alvo_id and mode='purge';end if;
 insert into public.admin_user_deletion_storage_manifest(job_id,bucket_id,object_path)select job.id,o.bucket_id,o.object_path from public.user_storage_ownership o where o.owner_id=p_usuario_alvo_id on conflict do nothing;
 return query select m.job_id,m.bucket_id,m.object_path from public.admin_user_deletion_storage_manifest m where m.job_id=job.id and m.deleted_at is null order by m.bucket_id,m.object_path;
end $$;
revoke all on function public.anonymizar_usuario_admin(uuid),public.iniciar_purga_total_usuario_admin(uuid) from public,anon,service_role;grant execute on function public.anonymizar_usuario_admin(uuid),public.iniciar_purga_total_usuario_admin(uuid) to authenticated;
