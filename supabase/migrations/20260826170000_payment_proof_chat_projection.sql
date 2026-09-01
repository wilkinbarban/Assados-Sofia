alter table public.mensagens add column if not exists payment_proof_id uuid references public.payment_proofs(id) on delete restrict;
create table public.payment_proof_chat_projections(
 proof_id uuid not null references public.payment_proofs(id) on delete restrict,
 conversa_id uuid not null references public.conversas(id) on delete restrict,
 message_id uuid not null unique references public.mensagens(id) on delete restrict,
 primary key(proof_id,conversa_id)
);
alter table public.payment_proof_chat_projections enable row level security;
revoke all on public.payment_proof_chat_projections from public,anon,authenticated;

create function public.project_payment_proof_to_chat(p_proof_id uuid,p_conversa_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$declare p public.payment_proofs%rowtype;m uuid;c uuid;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into p from public.payment_proofs where id=p_proof_id for update;
 select cliente_id into c from public.conversas where id=p_conversa_id;
 if p.status<>'admitted' or p.preview_storage_key is null or p.customer_id is distinct from c then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_CHAT_VISIBLE';end if;
 select message_id into m from public.payment_proof_chat_projections where proof_id=p_proof_id and conversa_id=p_conversa_id;if found then return m;end if;
 insert into public.mensagens(conversa_id,remetente,conteudo,url_anexo,payment_proof_id)
 values(p_conversa_id,'operador','Comprovante PIX admitido',concat('/api/payment-proofs/',p_proof_id,'/preview'),p_proof_id) returning id into m;
 insert into public.payment_proof_chat_projections values(p_proof_id,p_conversa_id,m);return m;end $$;
revoke all on function public.project_payment_proof_to_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_payment_proof_to_chat(uuid,uuid) to service_role;
