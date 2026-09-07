-- Web outbox delivery keys are globally generated from the unique outbox intent.
-- Keep legacy chat rows nullable while providing the exact non-partial unique
-- arbiter required by PostgREST `on_conflict=external_id`.
alter table public.mensagens
  add column if not exists external_id text;

create unique index if not exists mensagens_external_id_key
  on public.mensagens(external_id);

comment on column public.mensagens.external_id is
  'Chave global e imutável de idempotência para mensagens geradas pelo outbox Web; nula para mensagens históricas.';
