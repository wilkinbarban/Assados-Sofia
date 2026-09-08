-- Phase 7: publish sanitized payment-proof row changes for authenticated operator refresh.
-- RLS remains the read authority; Realtime does not grant mutation privileges.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payment_proofs'
  ) then
    alter publication supabase_realtime add table public.payment_proofs;
  end if;
end
$$;
