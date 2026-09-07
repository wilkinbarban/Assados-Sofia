\ir ../migrations/20260906190000_payment_proof_web_message_idempotency.sql
begin;
select plan(10);

select has_column('public','mensagens','external_id','mensagens exposes the Web outbox idempotency key');
select col_type_is('public','mensagens','external_id','text','Web outbox idempotency key is text');
select col_is_null('public','mensagens','external_id','historical messages may retain a null idempotency key');
select is((
  select count(*)
  from pg_index i
  join pg_class t on t.oid=i.indrelid
  join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='mensagens' and i.indisunique and i.indpred is null
    and pg_get_indexdef(i.indexrelid) like '%(external_id)%'
),1::bigint,'external_id has one non-partial unique arbiter for PostgREST on_conflict');

set role postgres;
insert into public.clientes(id,nome,telefone) values
 ('91919191-9191-4191-8191-919191919191','Web idempotency fixture','5541999999911'),
 ('92929292-9292-4292-8292-929292929292','Other Web fixture','5541999999912');
insert into public.conversas(id,cliente_id,status,ia_ativa) values
 ('93939393-9393-4393-8393-939393939393','91919191-9191-4191-8191-919191919191','aberta',false),
 ('94949494-9494-4494-8494-949494949494','92929292-9292-4292-8292-929292929292','aberta',false);
insert into public.mensagens(conversa_id,remetente,conteudo,url_anexo)
values('93939393-9393-4393-8393-939393939393','operador','historical',null);
insert into public.mensagens(conversa_id,remetente,conteudo,url_anexo,external_id)
values('93939393-9393-4393-8393-939393939393','operador','original',null,'payment-proof:web:intent-1')
on conflict(external_id) do nothing;
insert into public.mensagens(conversa_id,remetente,conteudo,url_anexo,external_id)
values('94949494-9494-4494-8494-949494949494','operador','replacement',null,'payment-proof:web:intent-1')
on conflict(external_id) do nothing;
insert into public.mensagens(conversa_id,remetente,conteudo,url_anexo,external_id)
values('93939393-9393-4393-8393-939393939393','operador','another historical row',null,null);

select is((select count(*) from public.mensagens where external_id='payment-proof:web:intent-1'),1::bigint,'duplicate delivery key creates one message');
select is((select conversa_id from public.mensagens where external_id='payment-proof:web:intent-1'),'93939393-9393-4393-8393-939393939393'::uuid,'collision preserves the original destination');
select is((select conteudo from public.mensagens where external_id='payment-proof:web:intent-1'),'original','collision preserves the original content');
select is((select count(*) from public.mensagens where external_id is null and conversa_id='93939393-9393-4393-8393-939393939393'),2::bigint,'multiple historical null keys remain valid');
select ok(has_table_privilege('service_role','public.mensagens','INSERT'),'service role retains message insertion permission');
select ok(has_table_privilege('service_role','public.mensagens','SELECT'),'service role can resolve PostgREST conflict results');

select * from finish();
rollback;
