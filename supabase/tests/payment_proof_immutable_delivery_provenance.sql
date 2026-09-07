\ir ../migrations/20260903190000_payment_proof_immutable_delivery_provenance.sql
begin;
select plan(26);

select ok(has_function_privilege('service_role', 'public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text)', 'EXECUTE'), 'service role retains canonical enqueue access');
select ok(not has_function_privilege('anon', 'public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text)', 'EXECUTE'), 'browser roles cannot enqueue canonical proofs');

set role postgres;
insert into public.clientes(id,nome,telefone) values('39393939-3939-4393-8393-393939393901','Immutable','5541999999901');
insert into public.conversas(id,cliente_id,status,ia_ativa) values('39393939-3939-4393-8393-393939393911','39393939-3939-4393-8393-393939393901','aberta',false);
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos)
values('39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393901','novo','pendente','retirada','pix',100,0,100);
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);

create temporary table immutable_provenance as
select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64));

select ok((select not duplicate and not idempotent from immutable_provenance), 'first immutable delivery is admitted and queued');
reset role;
set role postgres;
select ok((select count(*) from private.payment_proof_processing_queue q join immutable_provenance i on i.proof_id=q.proof_id)=1, 'first admission creates one queue row');
reset role;
set role postgres;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos) values
('39393939-3939-4393-8393-393939393922','39393939-3939-4393-8393-393939393901','novo','pendente','retirada','pix',100,0,100),
('39393939-3939-4393-8393-393939393923','39393939-3939-4393-8393-393939393901','novo','pendente','retirada','pix',100,0,100),
('39393939-3939-4393-8393-393939393924','39393939-3939-4393-8393-393939393901','novo','pendente','retirada','pix',100,0,100);
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
create temporary table immutable_global_canonical as
select * from public.admit_and_enqueue_payment_proof('web','immutable-global-canonical','39393939-3939-4393-8393-393939393901','sender-global-1','proofs/private/web/delivery/global-canonical.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393922','39393939-3939-4393-8393-393939393911',repeat('c',64));
create temporary table immutable_global_duplicate as
select * from public.admit_and_enqueue_payment_proof('web','immutable-global-duplicate','39393939-3939-4393-8393-393939393901','sender-global-2','proofs/private/web/delivery/global-duplicate.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393923','39393939-3939-4393-8393-393939393911',repeat('c',64));
select ok((select not duplicate and canonical_proof_id=proof_id from immutable_global_canonical), 'first global hash delivery is canonical and queued');
select ok((select duplicate and canonical_proof_id=(select proof_id from immutable_global_canonical) from immutable_global_duplicate), 'second delivery with the same hash is duplicate and returns immutable canonical UUID');
reset role;
set role postgres;
select is((select count(*) from private.payment_proof_processing_queue q join public.payment_proofs p on p.id=q.proof_id where p.sha256=repeat('c',64)), 1::bigint, 'same hash creates exactly one processing queue row');
select is((select count(*) from public.payment_proof_outbox o join immutable_global_duplicate d on d.proof_id=o.proof_id where o.event_type='payment_proof_duplicate'), 1::bigint, 'second global-hash delivery creates exactly one duplicate outbox row');
insert into public.payment_proof_hash_tombstones(sha256,canonical_proof_id) values(repeat('d',64),null);
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
create temporary table immutable_tombstone_duplicate as
select * from public.admit_and_enqueue_payment_proof('web','immutable-tombstone-duplicate','39393939-3939-4393-8393-393939393901','sender-tombstone','proofs/private/web/delivery/tombstone.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393924','39393939-3939-4393-8393-393939393911',repeat('d',64));
select ok((select duplicate and canonical_proof_id is null from immutable_tombstone_duplicate), 'detached tombstone fails closed as duplicate with nullable canonical UUID');
reset role;
set role postgres;
select ok((select p.status='duplicate' and not exists(select 1 from private.payment_proof_processing_queue q where q.proof_id=p.id) from public.payment_proofs p join immutable_tombstone_duplicate d on d.proof_id=p.id), 'detached tombstone never creates false canonical queue work');
select is((select count(*) from public.payment_proof_outbox o join immutable_tombstone_duplicate d on d.proof_id=o.proof_id where o.event_type='payment_proof_duplicate' and o.payload='{"message_key":"payment_proof_already_received"}'::jsonb), 1::bigint, 'detached tombstone creates one generic duplicate outbox row');
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select ok((select idempotent and duplicate and canonical_proof_id=(select proof_id from immutable_global_canonical) from public.admit_and_enqueue_payment_proof('web','immutable-global-duplicate','39393939-3939-4393-8393-393939393901','sender-global-2','proofs/private/web/delivery/global-duplicate.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393923','39393939-3939-4393-8393-393939393911',repeat('c',64))), 'exact duplicate delivery replay remains idempotent');
reset role;
set role postgres;
select is((select count(*) from public.payment_proof_outbox o join immutable_global_duplicate d on d.proof_id=o.proof_id where o.event_type='payment_proof_duplicate'), 1::bigint, 'exact duplicate replay does not duplicate outbox');
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select ok((select idempotent from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64))), 'exact retry is idempotent');
reset role;
set role postgres;
select is((select count(*) from private.payment_proof_processing_queue q join immutable_provenance i on i.proof_id=q.proof_id), 1::bigint, 'exact retry does not duplicate queue work');
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);

select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-2','proofs/private/web/delivery/hash-a.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'changed sender conflicts');
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1',null,100,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'null storage key conflicts');
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',null,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'null size conflicts');
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',100,null,'39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'null MIME conflicts');
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',100,'application/x-pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'changed MIME conflicts');
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',100,'application/pdf',null,'39393939-3939-4393-8393-393939393911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'changed order intent conflicts');
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393912',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'changed conversation conflicts');
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-b.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('b',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'changed content hash conflicts');
select is((select sha256 from public.payment_proofs p join immutable_provenance i on i.proof_id=p.id), repeat('a',64), 'conflicting replay never rewrites registered hash');
update public.payment_proofs set sha256=null where id=(select proof_id from immutable_provenance);
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('web','immutable-delivery','39393939-3939-4393-8393-393939393901','sender-1','proofs/private/web/delivery/hash-a.pdf',100,'application/pdf','39393939-3939-4393-8393-393939393921','39393939-3939-4393-8393-393939393911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'legacy null hash fails rather than repairing provenance');
select is((select sha256 from public.payment_proofs p join immutable_provenance i on i.proof_id=p.id), null::text, 'null legacy hash is never repaired by replay');

reset role;
select * from finish();
rollback;
