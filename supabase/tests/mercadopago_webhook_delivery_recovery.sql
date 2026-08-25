\ir ../migrations/20260824150000_mercado_pago_webhook_delivery_recovery.sql
\ir ../migrations/20260824152000_fix_mercado_pago_dead_letter_terminal_schedule.sql
select plan(3);

set role postgres;
delete from public.mercado_pago_webhook_admissions where request_id in ('jd2-mp-recovery', 'jd2-mp-expired', 'jd2-mp-dead-letter');
insert into public.mercado_pago_webhook_admissions(request_id, payment_id) values ('jd2-mp-recovery', 'payment-jd2');
insert into public.mercado_pago_webhook_admissions(request_id, payment_id, delivery_status, claimed_until, next_attempt_at)
values ('jd2-mp-expired', 'payment-expired', 'processing', now() - interval '1 minute', now() - interval '1 minute');
reset role;
set role service_role;
do $$
declare v_claimed boolean; v_status text; v_attempts integer;
begin
  select claimed, delivery_status into v_claimed, v_status
  from public.reivindicar_webhook_mercado_pago('jd2-mp-recovery', 'payment-jd2', 60);
  if not v_claimed or v_status <> 'processing' then raise exception 'first claim failed'; end if;

  perform public.falhar_webhook_mercado_pago('jd2-mp-recovery', 'payment-jd2', 'temporary upstream error');
  select claimed into v_claimed from public.reivindicar_webhook_mercado_pago('jd2-mp-recovery', 'payment-jd2', 60);
  if not v_claimed then raise exception 'failed delivery was not retryable'; end if;

  perform public.concluir_webhook_mercado_pago('jd2-mp-recovery', 'payment-jd2');
  select claimed, delivery_status into v_claimed, v_status
  from public.reivindicar_webhook_mercado_pago('jd2-mp-recovery', 'payment-jd2', 60);
  if v_claimed or v_status <> 'completed' then raise exception 'completed duplicate claimed again'; end if;

  -- The service role intentionally cannot read the private queue table; the
  -- successful retry and inert completed duplicate prove its durable state.
end $$;
reset role;
set role postgres;
delete from public.mercado_pago_webhook_admissions where request_id = 'jd2-mp-recovery';
reset role;
select pass('Mercado Pago delivery claims recover after failure and completed duplicates remain inert');
set role service_role;
do $$
declare v_request_id text; v_payment_id text; v_claimed boolean;
begin
  select request_id, payment_id into v_request_id, v_payment_id
  from public.reivindicar_proximo_webhook_mercado_pago(60);
  if v_request_id <> 'jd2-mp-expired' or v_payment_id <> 'payment-expired' then
    raise exception 'expired lease was not claimed by recovery worker';
  end if;

  select claimed into v_claimed
  from public.reivindicar_webhook_mercado_pago('jd2-mp-expired', 'payment-expired', 60);
  if v_claimed then
    raise exception 'concurrent worker acquired an active recovery lease';
  end if;
end $$;
reset role;
select pass('expired leases are claimed atomically by the bounded recovery worker');
set role postgres;
insert into public.mercado_pago_webhook_admissions(request_id, payment_id)
values ('jd2-mp-dead-letter', 'payment-dead-letter');
reset role;
set role service_role;
do $$
declare
  v_claimed boolean;
  v_status text;
  v_attempt_count integer;
  v_next_attempt_at timestamptz;
  v_last_error text;
  v_request_id text;
begin
  for v_attempt_count in 1..5 loop
    select claimed into v_claimed
    from public.reivindicar_webhook_mercado_pago('jd2-mp-dead-letter', 'payment-dead-letter', 60);
    if not v_claimed then raise exception 'attempt % was not claimed', v_attempt_count; end if;
    if not public.falhar_webhook_mercado_pago('jd2-mp-dead-letter', 'payment-dead-letter', 'upstream failure ' || v_attempt_count) then
      raise exception 'attempt % failure was not persisted', v_attempt_count;
    end if;
  end loop;

  reset role;
  set role postgres;
  select delivery_status, attempt_count, next_attempt_at, last_error
  into v_status, v_attempt_count, v_next_attempt_at, v_last_error
  from public.mercado_pago_webhook_admissions
  where request_id = 'jd2-mp-dead-letter';
  if v_status <> 'dead_letter' or v_attempt_count <> 5 or v_next_attempt_at is null or v_last_error <> 'upstream failure 5' then
    raise exception 'fifth failure did not retain terminal audit state';
  end if;
  reset role;
  set role service_role;
  select claimed into v_claimed
  from public.reivindicar_webhook_mercado_pago('jd2-mp-dead-letter', 'payment-dead-letter', 60);
  if v_claimed then raise exception 'dead letter was claimed again'; end if;
  select request_id into v_request_id from public.reivindicar_proximo_webhook_mercado_pago(60);
  if v_request_id = 'jd2-mp-dead-letter' then raise exception 'dead letter was selected by recovery worker'; end if;
end $$;
reset role;
select pass('fifth failure commits a non-null dead letter audit and terminal rows remain unclaimable');
set role postgres;
delete from public.mercado_pago_webhook_admissions where request_id in ('jd2-mp-recovery', 'jd2-mp-expired', 'jd2-mp-dead-letter');
reset role;
select * from finish();
