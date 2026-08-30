-- Foundation only: channel adapters and lifecycle RPCs arrive in later slices.
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.clientes(id) on delete restrict,
  channel text not null check (channel in ('web','whatsapp','telegram')),
  delivery_key text not null,
  sender_reference text,
  status text not null default 'received' check (status in (
    'received','identity_pending','processing','review','admitted','quarantined','duplicate','purged'
  )),
  original_storage_key text not null,
  preview_storage_key text,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  suggested_cents integer check (suggested_cents is null or suggested_cents >= 0),
  confirmed_cents integer check (confirmed_cents is null or confirmed_cents >= 0),
  extraction_confidence numeric(5,4) check (extraction_confidence is null or extraction_confidence between 0 and 1),
  quarantined_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel, delivery_key),
  check (purge_after is null or quarantined_at is not null),
  check (status <> 'purged' or preview_storage_key is null)
);

create index payment_proofs_customer_created_idx on public.payment_proofs(customer_id, created_at desc);
create index payment_proofs_status_created_idx on public.payment_proofs(status, created_at);
create index payment_proofs_sha256_idx on public.payment_proofs(sha256) where sha256 is not null;

create table public.payment_proof_events (
  id bigint generated always as identity primary key,
  proof_id uuid not null references public.payment_proofs(id) on delete restrict,
  event_type text not null,
  actor_id uuid,
  source text not null check (source in ('web','whatsapp','telegram','operator','worker','migration')),
  previous_status text,
  result_status text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);
create index payment_proof_events_proof_sequence_idx on public.payment_proof_events(proof_id,id);

alter table public.payment_proofs enable row level security;
alter table public.payment_proof_events enable row level security;
revoke all on public.payment_proofs, public.payment_proof_events from public, anon, authenticated;
grant select on public.payment_proofs, public.payment_proof_events to authenticated;
revoke insert, update, delete, truncate on public.payment_proofs from public, anon, authenticated;
revoke insert, update, delete, truncate on public.payment_proof_events from public, anon, authenticated;

create policy payment_proofs_customer_read on public.payment_proofs for select to authenticated using (
  customer_id in (select c.id from public.clientes c where c.usuario_id = auth.uid())
  and status = 'admitted'
);
create policy payment_proofs_staff_read on public.payment_proofs for select to authenticated using (
  exists (select 1 from public.perfis p where p.id=auth.uid() and p.ativo = true and p.funcao in ('admin','supervisor','vendedor'))
);
create policy payment_proof_events_staff_read on public.payment_proof_events for select to authenticated using (
  exists (select 1 from public.perfis p where p.id=auth.uid() and p.ativo = true and p.funcao in ('admin','supervisor','vendedor'))
);
create policy payment_proof_events_customer_read on public.payment_proof_events for select to authenticated using (
  exists (select 1 from public.payment_proofs proof join public.clientes c on c.id=proof.customer_id
    where proof.id=proof_id and proof.status='admitted' and c.usuario_id=auth.uid())
);

-- Prevent table owners and future grants from mutating immutable audit rows.
create function public.block_payment_proof_event_mutation() returns trigger
language plpgsql set search_path='' as $$ begin
  raise exception using errcode='42501', message='PAYMENT_PROOF_EVENT_IMMUTABLE';
end $$;
create trigger payment_proof_events_immutable before update or delete on public.payment_proof_events
for each row execute function public.block_payment_proof_event_mutation();
revoke all on function public.block_payment_proof_event_mutation() from public, anon, authenticated;
