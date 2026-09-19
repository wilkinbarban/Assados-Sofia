-- LGPD (memoria_cliente, slice 4): a anonimizacao administrativa passa a remover os fatos por
-- cliente antes de desvincular a identidade. `clientes.usuario_id` e a unica ligacao entre o
-- usuario e o registro de cliente, entao uma exclusao posterior a anulacao de `usuario_id` nao
-- encontraria mais nenhuma linha para apagar. O corpo atual
-- (20260826222000_dual_deletion_runtime_fixes.sql) e preservado verbatim, com exatamente uma
-- instrucao nova. Rollback: esta migracao e a tabela `public.fatos_cliente` voltam juntas,
-- porque reverter apenas a exclusao recria silenciosamente o vazamento de anonimizacao.
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
 -- Unica instrucao nova: antes de anular `usuario_id`, apagar os fatos do cliente alvo.
 delete from public.fatos_cliente f using public.clientes c where c.id=f.cliente_id and c.usuario_id=p_usuario_alvo_id;
 update public.clientes set usuario_id=null,nome='Deleted customer',telefone=v_anonymized_phone,email=null,telegram_chat_id=null where usuario_id=p_usuario_alvo_id;
 update public.perfis set ativo=false,deletion_requested_at=now(),auth_delete_completed_at=null where id=p_usuario_alvo_id;
 insert into public.logs_auditoria(usuario_id,acao,detalhes) values(v_actor,'anonymizar_usuario',jsonb_build_object('usuario_alvo_id',p_usuario_alvo_id,'auth_delete_pending',true));
end $$;
revoke all on function public.anonymizar_usuario_admin(uuid),public.iniciar_purga_total_usuario_admin(uuid) from public,anon,service_role;grant execute on function public.anonymizar_usuario_admin(uuid),public.iniciar_purga_total_usuario_admin(uuid) to authenticated;
