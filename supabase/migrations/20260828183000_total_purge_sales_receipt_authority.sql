-- Total purge is reserved for explicitly confirmed test accounts. Sales
-- receipts stay immutable everywhere else, including normal production
-- anonymization. The purge RPC already sets this transaction-local flag only
-- after locking and authorizing its durable deletion job.
create or replace function public.proteger_comprovante_venda_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.total_user_purge', true) = 'on'
     and auth.uid() is not null
     and exists (
       select 1
       from public.admin_user_deletion_jobs
       where actor_id = auth.uid()
         and mode = 'purge'
         and status in ('storage_pending', 'sql_pending')
     )
  then
    return old;
  end if;

  raise exception using errcode = '55000', message = 'SALES_RECEIPT_IMMUTABLE';
end
$$;
