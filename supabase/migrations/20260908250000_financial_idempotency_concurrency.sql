-- Serialize financial idempotency keys before their first lookup so concurrent
-- retries observe committed results rather than surfacing raw unique violations.
create function public.financial_idempotency_lock(p_key uuid) returns void language sql volatile set search_path='' as $$select pg_advisory_xact_lock(hashtextextended(p_key::text,84621))$$;
revoke all on function public.financial_idempotency_lock(uuid) from public,anon,authenticated,service_role;

create unique index cash_movements_order_payment_once on public.cash_movements(pedido_id) where movement_type='order_payment';
create unique index cash_movements_receivable_settlement_once on public.cash_movements(receivable_settlement_id) where movement_type='receivable_settlement';

-- Function bodies receive the lock at their first BEGIN without duplicating the
-- full security-definer contracts in this forward-only correction.
do $$declare r record;v_definition text;v_updated text;begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('liquidar_conta_receber','record_cash_movement','close_cash_session','record_financial_settlement','record_bank_statement_entry','reconcile_bank_settlement') loop
  v_definition:=pg_get_functiondef(r.oid);
  v_updated:=regexp_replace(v_definition,E'begin\\n',E'begin\n perform public.financial_idempotency_lock(p_idempotency_key);\n',1,1,'i');
  if v_updated=v_definition then raise exception 'FINANCIAL_LOCK_PATCH_FAILED:%',r.proname;end if;
  execute v_updated;
 end loop;
end$$;
