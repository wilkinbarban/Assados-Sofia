-- Fatos por cliente da Sofia (memoria_cliente): schema, invariantes e conjunto de indices.
-- O preludio guardado segue supabase/tests/admin_user_dual_deletion.sql: o harness local
-- descartavel ja aplicou a cadeia completa, enquanto o runner self-hosted clona um banco que
-- ainda pode nao conter esta migracao. O harness tambem afirma a contagem exata de
-- `alter function ... owner to supabase_admin`; este slice nao adiciona nenhuma.
create extension if not exists pgtap;
select not to_regclass('public.fatos_cliente') is not null as apply_fatos_cliente_schema \gset
\if :apply_fatos_cliente_schema
\ir ../migrations/20260918010000_fatos_cliente_schema.sql
\endif
begin;
select plan(87);
set role postgres;

insert into public.clientes(id,nome,telefone) values
 ('f1000000-0000-4000-8000-000000000001','Memoria A','5541997000001'),
 ('f1000000-0000-4000-8000-000000000002','Memoria B','5541997000002');
insert into public.conversas(id,cliente_id) values
 ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001'),
 ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002');

-- Relacao, colunas, nulabilidade e chaves estrangeiras.
select has_table('public','fatos_cliente','public.fatos_cliente exists as the typed customer fact store');
select has_column('public','fatos_cliente','id','fatos_cliente exposes id');
select has_column('public','fatos_cliente','cliente_id','fatos_cliente exposes cliente_id');
select has_column('public','fatos_cliente','tipo','fatos_cliente exposes tipo');
select has_column('public','fatos_cliente','chave','fatos_cliente exposes chave');
select has_column('public','fatos_cliente','valor','fatos_cliente exposes valor');
select has_column('public','fatos_cliente','origem','fatos_cliente exposes origem');
select has_column('public','fatos_cliente','origem_conversa_id','fatos_cliente exposes origem_conversa_id');
select has_column('public','fatos_cliente','confianca','fatos_cliente exposes confianca');
select has_column('public','fatos_cliente','estado','fatos_cliente exposes estado');
select has_column('public','fatos_cliente','revisado_por','fatos_cliente exposes revisado_por');
select has_column('public','fatos_cliente','revisado_em','fatos_cliente exposes revisado_em');
select has_column('public','fatos_cliente','substitui_id','fatos_cliente exposes substitui_id');
select has_column('public','fatos_cliente','criado_em','fatos_cliente exposes criado_em');
select has_column('public','fatos_cliente','atualizado_em','fatos_cliente exposes atualizado_em');
select col_is_pk('public','fatos_cliente','id','id is the identity primary key');
select col_type_is('public','fatos_cliente','confianca','numeric(3,2)','confidence keeps the designed scale');
select col_type_is('public','fatos_cliente','origem_conversa_id','uuid','provenance points at a conversation uuid');
select is(
 (select array_agg(a.attname::text order by a.attname) from pg_catalog.pg_attribute a
   where a.attrelid='public.fatos_cliente'::regclass and a.attnum>0 and not a.attisdropped and not a.attnotnull),
 array['confianca','origem_conversa_id','revisado_em','revisado_por','substitui_id']::text[],
 'exactly the five designed columns are nullable');
select ok(exists (select 1 from pg_catalog.pg_constraint c where c.conrelid='public.fatos_cliente'::regclass and c.contype='f' and c.confrelid='public.clientes'::regclass and c.confdeltype='c'),'cliente_id cascades with the customer row so the total purge stays complete');
select ok(exists (select 1 from pg_catalog.pg_constraint c where c.conrelid='public.fatos_cliente'::regclass and c.contype='f' and c.confrelid='public.conversas'::regclass and c.confdeltype='n'),'losing a conversation nulls the provenance pointer instead of the durable fact');
select ok(exists (select 1 from pg_catalog.pg_constraint c where c.conrelid='public.fatos_cliente'::regclass and c.contype='f' and c.confrelid='public.fatos_cliente'::regclass and c.confdeltype='n'),'the self reference degrades to a null history link rather than a cascade');
select is((select count(*)::integer from pg_catalog.pg_constraint c where c.conrelid='public.fatos_cliente'::regclass and c.contype='f'),3,'the table declares exactly three foreign keys, so revisado_por carries none');

-- Constraints nomeadas: a definicao exata e os dois comentarios centrais.
select is(
 (select array_agg(c.conname::text order by c.conname) from pg_catalog.pg_constraint c where c.conrelid='public.fatos_cliente'::regclass and c.contype='c'),
 array['ck_fatos_cliente_aprovacao','ck_fatos_cliente_chave','ck_fatos_cliente_confianca','ck_fatos_cliente_estado','ck_fatos_cliente_origem','ck_fatos_cliente_revisao','ck_fatos_cliente_tipo','ck_fatos_cliente_valor_controle','ck_fatos_cliente_valor_invisivel','ck_fatos_cliente_valor_nao_vazio','ck_fatos_cliente_valor_tamanho']::text[],
 'the eleven check constraints are exactly the designed ones');
select pg_catalog.pg_get_constraintdef(c.oid) as aprovacao_def from pg_catalog.pg_constraint c where c.conrelid='public.fatos_cliente'::regclass and c.conname='ck_fatos_cliente_aprovacao' \gset
select ok(position('0.85' in :'aprovacao_def') > 0,'the 0.85 threshold is a literal inside ck_fatos_cliente_aprovacao, so lowering it needs a migration');
select ok(position('restricao_alimentar' in :'aprovacao_def') > 0,'restricao_alimentar is excluded from auto-approval inside the constraint');
select ok(position('importado' in :'aprovacao_def') = 0,'importado is not part of the trusted set of ck_fatos_cliente_aprovacao');
select ok(position('cliente' in :'aprovacao_def') > 0 and position('operador' in :'aprovacao_def') > 0,'the trusted origins are exactly cliente and operador');
select ok(pg_catalog.obj_description('public.fatos_cliente'::regclass) is not null,'the table documents itself in pt-BR');
select is((select count(*)::integer from pg_catalog.pg_description d where d.objoid='public.fatos_cliente'::regclass and d.classoid='pg_catalog.pg_class'::regclass and d.objsubid>0),5,'the five documented columns carry pt-BR comments');
select is((select count(*)::integer from pg_catalog.pg_description d join pg_catalog.pg_constraint c on c.oid=d.objoid where c.conrelid='public.fatos_cliente'::regclass and d.classoid='pg_catalog.pg_constraint'::regclass),2,'the two central constraints carry pt-BR comments');

-- Contrato de forma: enums, chave e valor.
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,origem_conversa_id,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','ponto_da_carne','ao ponto para bem passado','ia','f2000000-0000-4000-8000-000000000001',0.90,'pendente')$$,'a well formed inferred fact is stored with its provenance and confidence');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','endereco',repeat('a',64),repeat('b',500),'cliente','pendente')$$,'the 64 character key and 500 character value boundaries are accepted');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','cor','cor','azul','cliente','pendente')$$,'23514',null,'a tipo outside the five permitted values is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','voz','forte','voz','pendente')$$,'23514',null,'an origem outside the four permitted values is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','estado_invalido','x','cliente','arquivado')$$,'23514',null,'an estado outside the four permitted values is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','ChaveMaiuscula','x','cliente','pendente')$$,'23514',null,'a key with uppercase characters violates the key regex');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia',repeat('a',65),'x','cliente','pendente')$$,'23514',null,'a 65 character key violates the key regex');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','valor_vazio','','cliente','pendente')$$,'23514',null,'an empty value is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','valor_longo',repeat('b',501),'cliente','pendente')$$,'23514',null,'a 501 character value is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','valor_espaco',' ao ponto','cliente','pendente')$$,'23514',null,'a value with leading whitespace is rejected instead of trimmed on write');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','valor_quebra','ao ponto'||chr(10)||'sem cebola','cliente','pendente')$$,'23514',null,'a newline inside a value is rejected because the prompt block is line oriented');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','valor_controle','ao ponto'||chr(7),'cliente','pendente')$$,'23514',null,'a C0 control character inside a value is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','valor_invisivel','ao ponto'||chr(8203),'cliente','pendente')$$,'23514',null,'a zero width character inside a value is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','valor_bidi','ao ponto'||chr(8236),'cliente','pendente')$$,'23514',null,'a bidirectional override inside a value is rejected');

-- Matriz de aprovacao: o limite 0.85 vive na constraint, importado nao e confiavel e
-- restricao_alimentar nunca se auto-aprova.
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','auto_aprovado','bem passado','ia',0.85,'aprovado')$$,'an inferred fact at exactly the 0.85 bound is stored approved with no reviewer');
select ok((select f.estado='aprovado' and f.revisado_por is null from public.fatos_cliente f where f.chave='auto_aprovado'),'the auto-approved row carries no reviewer, so the audit predicate derives it');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','abaixo_limite','mal passado','ia',0.84,'aprovado')$$,'23514',null,'a below-threshold inference cannot be stored approved');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','abaixo_limite','mal passado','ia',0.84,'pendente')$$,'the same below-threshold inference is accepted as pending');
select ok((select f.estado='pendente' from public.fatos_cliente f where f.chave='abaixo_limite'),'the below-threshold inference is stored pending');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','sem_limite','no meio','ia',0.50,'aprovado')$$,'23514',null,'a raw 0.50 approval is rejected by the database with no caller-side check');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','restricao_alimentar','alergia_max','castanha','ia',1.00,'pendente')$$,'a maximum-confidence allergy inference is stored pending');
select ok((select f.estado='pendente' from public.fatos_cliente f where f.chave='alergia_max'),'restricao_alimentar is never auto-approved at any confidence');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','restricao_alimentar','alergia_forcada','castanha','ia',1.00,'aprovado')$$,'23514',null,'even a direct write cannot auto-approve restricao_alimentar');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','importado_sem_revisor','antigo','importado','aprovado')$$,'23514',null,'importado with estado aprovado and no reviewer is rejected');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado,revisado_por,revisado_em) values('f1000000-0000-4000-8000-000000000001','preferencia','importado_revisado','antigo','importado','aprovado','f3000000-0000-4000-8000-000000000001',now())$$,'an imported fact reaches approved only through a recorded reviewer');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','operador_confianca','x','operador',0.90,'pendente')$$,'23514',null,'an operator fact cannot carry a confidence');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','cliente_confianca','x','cliente',0.50,'pendente')$$,'23514',null,'a customer statement cannot carry a confidence');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','confianca_alta','ao ponto','ia',0.90,'aprovado')$$,'an inferred fact may carry a confidence and auto-approve above the bound');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','confianca_fora','x','ia',1.20,'pendente')$$,'23514',null,'a confidence outside 0..1 is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado,revisado_por) values('f1000000-0000-4000-8000-000000000001','preferencia','revisor_sem_data','x','ia',0.50,'pendente','f3000000-0000-4000-8000-000000000001')$$,'23514',null,'a reviewer without a review time is rejected');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado,revisado_em) values('f1000000-0000-4000-8000-000000000001','preferencia','data_sem_revisor','x','ia',0.50,'pendente',now())$$,'23514',null,'a review time without a reviewer is rejected');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,confianca,estado,revisado_por,revisado_em) values('f1000000-0000-4000-8000-000000000001','preferencia','revisado_pelo_operador','restricao de sal','ia',0.50,'aprovado','f3000000-0000-4000-8000-000000000001',now())$$,'a sub-threshold inference becomes approved only with a recorded reviewer');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','endereco','origem_cliente','Rua das Flores, 123','cliente','aprovado')$$,'a trusted human origin approves without a reviewer');
select is(
 (select array_agg(f.chave::text order by f.chave) from public.fatos_cliente f where f.origem='ia' and f.revisado_por is null and f.estado='aprovado'),
 array['auto_aprovado','confianca_alta']::text[],
 'the audit predicate selects exactly the auto-approved facts and excludes the operator-approved inference');
select is(
 (select array_agg(f.chave::text order by f.chave) from public.fatos_cliente f where f.estado='aprovado' and not (f.origem='ia' and f.revisado_por is null)),
 array['importado_revisado','origem_cliente','revisado_pelo_operador']::text[],
 'every other approved fact is explainable as a trusted human origin or a recorded reviewer');

-- RLS e privilegios: a tabela so e alcancavel pelas funcoes.
select ok((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.fatos_cliente'::regclass),'row level security is enabled on the fact table');
select ok(not (select c.relforcerowsecurity from pg_catalog.pg_class c where c.oid='public.fatos_cliente'::regclass),'row level security is not forced, so the security definer functions keep seeing rows');
select is((select count(*)::integer from pg_catalog.pg_policy p where p.polrelid='public.fatos_cliente'::regclass),0,'no RLS policy exists; the function surface is the only access path');
select table_privs_are('public','fatos_cliente','anon',array[]::text[],'anon holds no privilege on the fact table');
select table_privs_are('public','fatos_cliente','authenticated',array[]::text[],'authenticated holds no privilege on the fact table');
select table_privs_are('public','fatos_cliente','service_role',array[]::text[],'service_role holds no privilege on the fact table');
select ok(not exists (select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where c.oid='public.fatos_cliente'::regclass and a.grantee=0),'PUBLIC holds no privilege on the fact table');

-- Indices: conjunto exato, predicados parciais e reuso da chave. A migracao nao adiciona
-- `alter function ... owner to supabase_admin`; a contagem exata de transferencias e afirmada
-- pelo proprio harness (scripts/run-local-sofia-sql-tests.sh, expected_owner_transfers=8).
select is(
 (select array_agg(c.relname::text order by c.relname) from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid where i.indrelid='public.fatos_cliente'::regclass),
 array['fatos_cliente_auto_aprovados','fatos_cliente_origem_conversa','fatos_cliente_pkey','fatos_cliente_prompt','fatos_cliente_revisao','fatos_cliente_substitui','uq_fatos_cliente_vigente']::text[],
 'the fact table carries exactly the designed index set');
select ok(pg_catalog.pg_get_indexdef(to_regclass('public.uq_fatos_cliente_vigente')) like 'CREATE UNIQUE INDEX%' and pg_catalog.pg_get_indexdef(to_regclass('public.uq_fatos_cliente_vigente')) like '%(cliente_id, tipo, chave)%' and pg_catalog.pg_get_indexdef(to_regclass('public.uq_fatos_cliente_vigente')) like '%pendente%' and pg_catalog.pg_get_indexdef(to_regclass('public.uq_fatos_cliente_vigente')) like '%aprovado%','uq_fatos_cliente_vigente is the partial unique one-live-fact-per-key index');
select ok(pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_prompt')) like '%(cliente_id, tipo, chave)%' and pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_prompt')) like '%estado = ''aprovado''%' and pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_prompt')) like '%tipo <> ''observacao''%','the prompt index is limited to approved non-observacao facts');
select ok(pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_revisao')) like '%(cliente_id, estado, atualizado_em DESC)%','the review index serves the operator order by estado, atualizado_em desc');
select ok(pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_auto_aprovados')) like '%(criado_em DESC)%' and pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_auto_aprovados')) like '%origem = ''ia''%' and pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_auto_aprovados')) like '%revisado_por IS NULL%' and pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_auto_aprovados')) like '%estado = ''aprovado''%','the audit index makes the auto-approval predicate visible at the schema level');
select ok(pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_origem_conversa')) like '%(origem_conversa_id)%' and pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_origem_conversa')) like '%IS NOT NULL%','the provenance foreign key action has a partial index of its own');
select ok(pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_substitui')) like '%(substitui_id)%' and pg_catalog.pg_get_indexdef(to_regclass('public.fatos_cliente_substitui')) like '%IS NOT NULL%','the supersession self reference has a partial index of its own');
select throws_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','endereco','origem_cliente','Rua Nova, 45','operador','pendente')$$,'23505',null,'a second live row for the key is rejected by uq_fatos_cliente_vigente even for a raw insert');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','formato_pedido','historico_limpo','sem cebola','operador','rejeitado')$$,'a rejected fact is retained as history');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','formato_pedido','historico_limpo','com cebola','operador','pendente')$$,'a rejected row does not block a new live fact for the key');
select is((select count(*)::integer from public.fatos_cliente f where f.chave='historico_limpo' and f.estado in ('pendente','aprovado')),1,'exactly one live row remains for the key after a rejection');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','substituido_historico','antigo','operador','substituido')$$,'a superseded fact is retained as history');
select lives_ok($$insert into public.fatos_cliente(cliente_id,tipo,chave,valor,origem,estado) values('f1000000-0000-4000-8000-000000000001','preferencia','substituido_historico','novo','operador','aprovado')$$,'a superseded row does not block a new live fact for the key');
select is((select count(*)::integer from public.fatos_cliente f where f.chave='substituido_historico' and f.estado in ('pendente','aprovado')),1,'exactly one live row remains for the key after a supersession');

select * from finish();
rollback;
