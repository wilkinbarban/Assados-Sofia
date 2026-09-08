-- Phase 8c: operational provider settlement and bank reconciliation facts.
-- References are digests/tokens; raw statements, card data and customer PII are forbidden.
create table public.financial_settlements(
 id uuid primary key default gen_random_uuid(),provider text not null check(provider in('mercado_pago','external_card','external_pix')),
 external_ref_digest text not null check(external_ref_digest ~ '^[0-9a-f]{64}$'),gross_centavos integer not null check(gross_centavos>0),
 fee_centavos integer not null check(fee_centavos>=0 and fee_centavos<=gross_centavos),net_centavos integer generated always as(gross_centavos-fee_centavos) stored,
 settled_on date not null,recorded_by uuid not null references auth.users(id),idempotency_key uuid not null unique,created_at timestamptz not null default now(),unique(provider,external_ref_digest)
);
create table public.bank_statement_entries(
 id uuid primary key default gen_random_uuid(),account_token text not null check(account_token ~ '^[a-z0-9_:-]{3,64}$'),
 entry_ref_digest text not null check(entry_ref_digest ~ '^[0-9a-f]{64}$'),posted_on date not null,amount_centavos integer not null check(amount_centavos<>0),
 recorded_by uuid not null references auth.users(id),idempotency_key uuid not null unique,created_at timestamptz not null default now(),unique(account_token,entry_ref_digest)
);
create table public.bank_reconciliations(
 id uuid primary key default gen_random_uuid(),bank_entry_id uuid not null unique references public.bank_statement_entries(id),
 settlement_id uuid not null unique references public.financial_settlements(id),actor_id uuid not null references auth.users(id),
 reason text not null check(nullif(btrim(reason),'') is not null),idempotency_key uuid not null unique,reconciled_at timestamptz not null default now()
);
create function public.reject_financial_reconciliation_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception using errcode='55000',message='FINANCIAL_RECONCILIATION_IMMUTABLE';end$$;
create trigger financial_settlements_immutable before update or delete on public.financial_settlements for each row execute function public.reject_financial_reconciliation_mutation();
create trigger bank_entries_immutable before update or delete on public.bank_statement_entries for each row execute function public.reject_financial_reconciliation_mutation();
create trigger bank_reconciliations_immutable before update or delete on public.bank_reconciliations for each row execute function public.reject_financial_reconciliation_mutation();
alter table public.financial_settlements enable row level security;alter table public.bank_statement_entries enable row level security;alter table public.bank_reconciliations enable row level security;
revoke all on public.financial_settlements,public.bank_statement_entries,public.bank_reconciliations from public,anon,authenticated,service_role;
grant select on public.financial_settlements,public.bank_statement_entries,public.bank_reconciliations to authenticated;
create policy financial_settlements_manager_read on public.financial_settlements for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));
create policy bank_entries_manager_read on public.bank_statement_entries for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));
create policy bank_reconciliations_manager_read on public.bank_reconciliations for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));
create function public.assert_financial_manager() returns void language plpgsql security definer set search_path='' as $$begin if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then raise exception using errcode='42501',message='FINANCIAL_MANAGER_REQUIRED';end if;end$$;
create function public.record_financial_settlement(p_provider text,p_ref_digest text,p_gross integer,p_fee integer,p_settled_on date,p_idempotency_key uuid) returns uuid language plpgsql security definer set search_path='' as $$declare v public.financial_settlements%rowtype;begin
 perform public.assert_financial_manager();select * into v from public.financial_settlements where idempotency_key=p_idempotency_key;if found then if v.provider<>p_provider or v.external_ref_digest<>lower(p_ref_digest) or v.gross_centavos<>p_gross or v.fee_centavos<>p_fee or v.settled_on<>p_settled_on or v.recorded_by<>auth.uid() then raise exception using errcode='23505',message='FINANCIAL_SETTLEMENT_IDEMPOTENCY_CONFLICT';end if;return v.id;end if;
 insert into public.financial_settlements(provider,external_ref_digest,gross_centavos,fee_centavos,settled_on,recorded_by,idempotency_key) values(p_provider,lower(p_ref_digest),p_gross,p_fee,p_settled_on,auth.uid(),p_idempotency_key) returning * into v;return v.id;end$$;
create function public.record_bank_statement_entry(p_account_token text,p_ref_digest text,p_posted_on date,p_amount integer,p_idempotency_key uuid) returns uuid language plpgsql security definer set search_path='' as $$declare v public.bank_statement_entries%rowtype;begin
 perform public.assert_financial_manager();select * into v from public.bank_statement_entries where idempotency_key=p_idempotency_key;if found then if v.account_token<>p_account_token or v.entry_ref_digest<>lower(p_ref_digest) or v.posted_on<>p_posted_on or v.amount_centavos<>p_amount or v.recorded_by<>auth.uid() then raise exception using errcode='23505',message='BANK_ENTRY_IDEMPOTENCY_CONFLICT';end if;return v.id;end if;
 insert into public.bank_statement_entries(account_token,entry_ref_digest,posted_on,amount_centavos,recorded_by,idempotency_key) values(p_account_token,lower(p_ref_digest),p_posted_on,p_amount,auth.uid(),p_idempotency_key) returning * into v;return v.id;end$$;
create function public.reconcile_bank_settlement(p_bank_entry_id uuid,p_settlement_id uuid,p_reason text,p_idempotency_key uuid) returns uuid language plpgsql security definer set search_path='' as $$declare v public.bank_reconciliations%rowtype;v_bank integer;v_net integer;v_reason text:=nullif(btrim(p_reason),'');begin
 perform public.assert_financial_manager();select * into v from public.bank_reconciliations where idempotency_key=p_idempotency_key;if found then if v.bank_entry_id<>p_bank_entry_id or v.settlement_id<>p_settlement_id or v.reason<>v_reason or v.actor_id<>auth.uid() then raise exception using errcode='23505',message='BANK_RECONCILIATION_IDEMPOTENCY_CONFLICT';end if;return v.id;end if;
 select amount_centavos into v_bank from public.bank_statement_entries where id=p_bank_entry_id for update;select net_centavos into v_net from public.financial_settlements where id=p_settlement_id for update;
 if v_reason is null or v_bank is null or v_net is null then raise exception using errcode='22023',message='BANK_RECONCILIATION_INVALID';end if;if v_bank<>v_net then raise exception using errcode='23514',message='BANK_RECONCILIATION_AMOUNT_MISMATCH';end if;
 insert into public.bank_reconciliations(bank_entry_id,settlement_id,actor_id,reason,idempotency_key) values(p_bank_entry_id,p_settlement_id,auth.uid(),v_reason,p_idempotency_key) returning * into v;return v.id;end$$;
revoke all on function public.assert_financial_manager(),public.record_financial_settlement(text,text,integer,integer,date,uuid),public.record_bank_statement_entry(text,text,date,integer,uuid),public.reconcile_bank_settlement(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.record_financial_settlement(text,text,integer,integer,date,uuid),public.record_bank_statement_entry(text,text,date,integer,uuid),public.reconcile_bank_settlement(uuid,uuid,text,uuid) to authenticated;
