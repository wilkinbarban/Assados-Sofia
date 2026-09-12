create extension if not exists pgtap;
\ir ../migrations/20260912010000_sofia_web_inbound_batch_admission.sql
select plan(3);

select ok(
  (select pg_get_constraintdef(oid) like '%web%' from pg_constraint
    where conname = 'sofia_inbound_batches_canal_check' and conrelid = 'public.sofia_inbound_batches'::regclass),
  'inbound batches accept the Web channel'
);
select ok(
  (select pg_get_constraintdef(oid) like '%web%' from pg_constraint
    where conname = 'sofia_response_outbox_canal_check' and conrelid = 'public.sofia_response_outbox'::regclass),
  'response outbox accepts the Web channel'
);
select ok(
  position('p_canal not in (''telegram'',''whatsapp'',''web'')' in pg_get_functiondef(
    'public.attach_sofia_inbound_message(uuid,uuid,uuid,text)'::regprocedure
  )) > 0,
  'attach RPC accepts Web only through its service-role path'
);
select * from finish();
