-- Forward-only, inert processing contract. No runner or scheduler is installed here.
create table public.sofia_response_outbox (
  batch_id uuid primary key references public.sofia_inbound_batches(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  canal text not null check (canal in ('telegram','whatsapp')),
  message_id uuid not null unique references public.mensagens(id) on delete cascade,
  response_text text not null check (nullif(btrim(response_text),'') is not null),
  status text not null default 'pending' check (status in ('pending','claimed','attempted','failed')),
  lease_token uuid,
  claimed_until timestamptz,
  attempted_at timestamptz,
  failure_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='claimed' and lease_token is not null and claimed_until is not null)
      or (status<>'claimed' and lease_token is null and claimed_until is null)),
  check ((status in ('attempted','failed'))=(attempted_at is not null)),
  check ((status='failed')=(failure_token is not null))
);
create index sofia_response_outbox_claim on public.sofia_response_outbox(batch_id)
  where status in ('pending','claimed');
alter table public.sofia_response_outbox enable row level security;
revoke all on table public.sofia_response_outbox from public,anon,authenticated,service_role;
comment on table public.sofia_response_outbox is 'One durable Sofia response and at-most-one external attempt per completed batch.';

create function public.claim_sofia_inbound_batch(p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.sofia_inbound_batches%rowtype; v_token uuid; result jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED'; end if;
  if p_lease_seconds not between 10 and 300 then raise exception using errcode='22023',message='SOFIA_BATCH_LEASE_INVALID'; end if;
  loop
    select * into b from public.sofia_inbound_batches
      where scheduled_process_at<=now() and (status='pending' or (status='processing' and claimed_until<=now()))
      order by scheduled_process_at,id for update skip locked limit 1;
    if not found then return null; end if;
    if b.status='processing' and exists(select 1 from public.sofia_response_outbox o where o.batch_id=b.id) then
      update public.sofia_inbound_batches set status='completed',completed_at=coalesce(completed_at,now()),lease_token=null,claimed_until=null,updated_at=now() where id=b.id;
      continue;
    end if;
    v_token:=gen_random_uuid();
    update public.sofia_inbound_batches set status='processing',attempt=attempt+1,lease_token=v_token,
      claimed_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now() where id=b.id returning * into b;
    select pg_catalog.jsonb_build_object(
      'batch_id',b.id,'conversa_id',b.conversa_id,'cliente_id',b.cliente_id,'channel',b.canal,
      'attempt',b.attempt,'lease_token',b.lease_token,'claimed_until',b.claimed_until,
      'eligibility',pg_catalog.jsonb_build_object('ia_ativa',c.ia_ativa,'conversation_status',c.status,
        'automation_allowed',cl.automacao_permitida,
        'whatsapp_status',case when b.canal='whatsapp' then cl.status_whatsapp end,
        'whatsapp_sleeping',case when b.canal='whatsapp' then coalesce(ws.sofia_dormindo and (ws.silenciada_ate is null or ws.silenciada_ate>now()),false) end,
        'sleep_reason',case when b.canal='whatsapp' then ws.motivo end,'sleep_until',case when b.canal='whatsapp' then ws.silenciada_ate end,
        'global_key',cfg.chave,'global_enabled',coalesce(lower(btrim(cfg.valor)) not in('false','0','no','n','off','disabled','nao','não'),true),
        'db_eligible',c.ia_ativa and c.status='ia_atendendo' and cl.automacao_permitida
          and (b.canal='telegram' or (cl.status_whatsapp='ativo' and not coalesce(ws.sofia_dormindo and (ws.silenciada_ate is null or ws.silenciada_ate>now()),false)))
          and coalesce(lower(btrim(cfg.valor)) not in('false','0','no','n','off','disabled','nao','não'),true),
        'requires_runtime_policy_check',true,'eligible',false),
      'members',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'message_id',m.id,'created_at',bm.message_created_at,'content',m.conteudo,
        'has_attachment',m.url_anexo is not null,'has_payment_proof',m.payment_proof_id is not null)
        order by bm.message_created_at,bm.message_id)
        from public.sofia_inbound_batch_messages bm join public.mensagens m on m.id=bm.message_id where bm.batch_id=b.id),'[]'::jsonb)
    ) into result from public.conversas c join public.clientes cl on cl.id=c.cliente_id
      left join public.whatsapp_sofia_states ws on b.canal='whatsapp' and ws.cliente_id=cl.id and ws.canal='whatsapp'
      left join public.configuracoes_sistema cfg on cfg.chave=case when b.canal='telegram' then 'SOFIA_GLOBAL_TELEGRAM_ENABLED' else 'SOFIA_GLOBAL_WHATSAPP_ENABLED' end
      where c.id=b.conversa_id;
    return result;
  end loop;
end$$;

create function public.cancel_sofia_inbound_batch(p_batch_id uuid,p_lease_token uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
 if p_reason not in('ia_inactive','handoff_or_pause','opt_out','sleep_or_cooldown','global_disabled','outside_business_hours') then raise exception using errcode='22023',message='SOFIA_BATCH_CANCEL_REASON_INVALID';end if;
 update public.sofia_inbound_batches set status='cancelled',cancelled_reason=p_reason,lease_token=null,claimed_until=null,updated_at=now() where id=p_batch_id and status='processing' and lease_token=p_lease_token;get diagnostics n=row_count;return n=1;
end$$;

create function public.fail_sofia_inbound_batch(p_batch_id uuid,p_lease_token uuid,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
 if p_error not in('assembly_failed','generation_failed','response_invalid','eligibility_lookup_failed') then raise exception using errcode='22023',message='SOFIA_BATCH_FAILURE_INVALID';end if;
 update public.sofia_inbound_batches set status='failed',failed_at=now(),last_error=p_error,lease_token=null,claimed_until=null,updated_at=now() where id=p_batch_id and status='processing' and lease_token=p_lease_token;get diagnostics n=row_count;return n=1;
end$$;

create function public.complete_sofia_inbound_batch(p_batch_id uuid,p_lease_token uuid,p_response_text text) returns jsonb
language plpgsql security definer set search_path='' as $$declare b public.sofia_inbound_batches%rowtype;o public.sofia_response_outbox%rowtype;m uuid;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
 if nullif(btrim(p_response_text),'') is null or length(p_response_text)>20000 then raise exception using errcode='22023',message='SOFIA_BATCH_RESPONSE_INVALID';end if;
 select * into b from public.sofia_inbound_batches where id=p_batch_id for update;if not found then return null;end if;
 if b.status<>'processing' or b.lease_token is distinct from p_lease_token or b.claimed_until<=now() then return null;end if;
 select * into o from public.sofia_response_outbox where batch_id=p_batch_id;
 if found then if o.response_text is distinct from p_response_text or o.conversa_id<>b.conversa_id or o.canal<>b.canal then raise exception using errcode='23505',message='SOFIA_BATCH_RESPONSE_CONFLICT';end if;return pg_catalog.to_jsonb(o);end if;
 insert into public.mensagens(conversa_id,remetente,conteudo,external_id) values(b.conversa_id,'ia'::public.tipo_remetente,p_response_text,'sofia-batch:'||b.id) returning id into m;
 insert into public.sofia_response_outbox(batch_id,conversa_id,canal,message_id,response_text) values(b.id,b.conversa_id,b.canal,m,p_response_text) returning * into o;
 update public.sofia_inbound_batches set status='completed',completed_at=now(),lease_token=null,claimed_until=null,updated_at=now() where id=b.id;
 return pg_catalog.to_jsonb(o);
end$$;

create function public.claim_sofia_response_delivery(p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path='' as $$declare o public.sofia_response_outbox%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
 if p_lease_seconds not between 10 and 300 then raise exception using errcode='22023',message='SOFIA_BATCH_LEASE_INVALID';end if;
 select * into o from public.sofia_response_outbox where status='pending' or(status='claimed' and claimed_until<=now()) order by created_at,batch_id for update skip locked limit 1;if not found then return null;end if;
 update public.sofia_response_outbox set status='claimed',lease_token=gen_random_uuid(),claimed_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now() where batch_id=o.batch_id returning * into o;return pg_catalog.to_jsonb(o);
end$$;

create function public.begin_sofia_response_delivery(p_batch_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
 update public.sofia_response_outbox set status='attempted',attempted_at=now(),lease_token=null,claimed_until=null,updated_at=now() where batch_id=p_batch_id and status='claimed' and lease_token=p_lease_token and claimed_until>now();get diagnostics n=row_count;return n=1;
end$$;

create function public.record_sofia_response_delivery_failure(p_batch_id uuid,p_failure text) returns boolean
language plpgsql security definer set search_path='' as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
 if p_failure not in('provider_unavailable','network_failure','provider_rejected') then raise exception using errcode='22023',message='SOFIA_RESPONSE_FAILURE_INVALID';end if;
 update public.sofia_response_outbox set status='failed',failure_token=p_failure,updated_at=now() where batch_id=p_batch_id and status='attempted';get diagnostics n=row_count;return n=1;
end$$;

revoke all on function public.claim_sofia_inbound_batch(integer),public.cancel_sofia_inbound_batch(uuid,uuid,text),public.fail_sofia_inbound_batch(uuid,uuid,text),public.complete_sofia_inbound_batch(uuid,uuid,text),public.claim_sofia_response_delivery(integer),public.begin_sofia_response_delivery(uuid,uuid),public.record_sofia_response_delivery_failure(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_sofia_inbound_batch(integer),public.cancel_sofia_inbound_batch(uuid,uuid,text),public.fail_sofia_inbound_batch(uuid,uuid,text),public.complete_sofia_inbound_batch(uuid,uuid,text),public.claim_sofia_response_delivery(integer),public.begin_sofia_response_delivery(uuid,uuid),public.record_sofia_response_delivery_failure(uuid,text) to service_role;
