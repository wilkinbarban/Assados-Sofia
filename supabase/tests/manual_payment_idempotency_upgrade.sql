-- Upgrade regression: execute the real forward migration over a database that
-- already contains a manual payment event from the preceding schema version.
begin;
select plan(5);

delete from public.pedido_payment_events
where pedido_id = '44444444-4444-4444-8444-444444444411';
delete from public.pedidos where id = '44444444-4444-4444-8444-444444444411';
delete from public.clientes where id = '44444444-4444-4444-8444-444444444410';

-- The pgTAP database is normally at HEAD. Recreate the immediately preceding
-- deployed shape so the migration is exercised as an actual upgrade.
alter table public.pedido_payment_events
  drop column if exists idempotency_key cascade;

insert into public.clientes(id, nome, telefone) values
  (
    '44444444-4444-4444-8444-444444444410',
    'Legacy payment customer',
    '5541999999944'
  );

insert into public.pedidos(
  id, cliente_id, status, tipo_entrega, total_produtos_centavos,
  total_pedido_centavos, meio_pagamento, status_pagamento
) values (
  '44444444-4444-4444-8444-444444444411',
  '44444444-4444-4444-8444-444444444410',
  'confirmado',
  'retirada',
  500,
  500,
  'pix',
  'aprovado'
);

-- Recreate the immediately preceding schema shape: no idempotency requirement.
alter table public.pedido_payment_events
  drop constraint if exists pedido_payment_events_check;

insert into public.pedido_payment_events(
  id, pedido_id, source, actor_id, external_reference, reason,
  previous_status, target_status, result_status
) values (
  '44444444-4444-4444-8444-444444444420',
  '44444444-4444-4444-8444-444444444411',
  'manual',
  '33333333-3333-4333-8333-333333333301',
  null,
  'cash confirmed before idempotency rollout',
  'pendente',
  'aprovado',
  'aprovado'
), (
  '44444444-4444-4444-8444-444444444422',
  '44444444-4444-4444-8444-444444444411',
  'manual',
  '33333333-3333-4333-8333-333333333301',
  null,
  'second historical manual event',
  'aprovado',
  'aprovado',
  'aprovado'
);

\ir ../migrations/20260820173000_manual_payment_idempotency_forward_fix.sql

select is(
  (
    select idempotency_key
    from public.pedido_payment_events
    where id = '44444444-4444-4444-8444-444444444420'
  ),
  '44444444-4444-4444-8444-444444444420'::uuid,
  'legacy manual event receives its immutable event id as the compatibility key'
);

select is(
  (
    select count(distinct idempotency_key)
    from public.pedido_payment_events
    where pedido_id = '44444444-4444-4444-8444-444444444411'
      and source = 'manual'
  ),
  2::bigint,
  'legacy backfill preserves a distinct auditable key for every event'
);

select is(
  (
    select array_agg(idempotency_key order by id)
    from public.pedido_payment_events
    where pedido_id = '44444444-4444-4444-8444-444444444411'
      and source = 'manual'
  ),
  array[
    '44444444-4444-4444-8444-444444444420'::uuid,
    '44444444-4444-4444-8444-444444444422'::uuid
  ],
  'legacy backfill never collapses distinct historical payment events'
);

select ok(
  (
    select convalidated
    from pg_constraint
    where conrelid = 'public.pedido_payment_events'::regclass
      and conname = 'pedido_payment_events_check'
  ),
  'upgraded payment-event constraint is validated after the legacy backfill'
);

select throws_ok(
  $$
    insert into public.pedido_payment_events(
      id, pedido_id, source, actor_id, external_reference, reason,
      previous_status, target_status, result_status, idempotency_key
    ) values (
      '44444444-4444-4444-8444-444444444421',
      '44444444-4444-4444-8444-444444444411',
      'manual',
      '33333333-3333-4333-8333-333333333301',
      null,
      'new manual event without a key',
      'aprovado',
      'aprovado',
      'aprovado',
      null
    )
  $$,
  '23514',
  null,
  'upgraded constraint rejects a new manual event without an idempotency key'
);

select * from finish();
rollback;
