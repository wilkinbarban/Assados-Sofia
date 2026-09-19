-- Fatos por cliente da Sofia (memoria_cliente), slice 1: tabela, invariantes, indices, RLS.
-- Sem `alter function ... owner to supabase_admin`: o harness local afirma exatamente oito
-- transferencias de posse e este slice nao muda essa constante (design 9.1).

create table public.fatos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null,
  chave text not null,
  valor text not null,
  origem text not null,
  origem_conversa_id uuid references public.conversas(id) on delete set null,
  confianca numeric(3,2),
  estado text not null default 'pendente',
  -- `revisado_por` de proposito nao tem chave estrangeira: as linhas de `public.perfis` sao
  -- removidas pela purga total, e um `on delete set null` abortaria essa purga ao reviolar
  -- ck_fatos_cliente_aprovacao.
  revisado_por uuid,
  revisado_em timestamptz,
  substitui_id uuid references public.fatos_cliente(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ck_fatos_cliente_tipo check (tipo in ('endereco','preferencia','restricao_alimentar','formato_pedido','observacao')),
  constraint ck_fatos_cliente_origem check (origem in ('cliente','operador','ia','importado')),
  constraint ck_fatos_cliente_estado check (estado in ('pendente','aprovado','rejeitado','substituido')),
  constraint ck_fatos_cliente_chave check (chave ~ '^[a-z0-9_]{1,64}$'),
  constraint ck_fatos_cliente_valor_nao_vazio check (valor <> '' and valor = pg_catalog.btrim(valor)),
  constraint ck_fatos_cliente_valor_tamanho check (char_length(valor) <= 500),
  constraint ck_fatos_cliente_valor_controle check (valor !~ '[[:cntrl:]]'),
  constraint ck_fatos_cliente_valor_invisivel check (valor !~ '[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]'),
  constraint ck_fatos_cliente_confianca check ((origem = 'ia' or confianca is null) and (confianca is null or confianca between 0 and 1)),
  constraint ck_fatos_cliente_revisao check ((revisado_por is null) = (revisado_em is null)),
  -- A autoridade da auto-aprovacao limitada vive aqui, com o 0.85 literal: baixar o limite
  -- exige migracao, e `importado` fica fora do conjunto confiavel de proposito (design 10).
  constraint ck_fatos_cliente_aprovacao check (
    estado <> 'aprovado'
    or origem in ('cliente','operador')
    or revisado_por is not null
    or (origem = 'ia' and tipo <> 'restricao_alimentar' and confianca >= 0.85)
  )
);

-- Um unico fato vigente por chave; rejeitado e substituido sao historico e nao bloqueiam.
create unique index uq_fatos_cliente_vigente on public.fatos_cliente (cliente_id, tipo, chave)
  where estado in ('pendente','aprovado');
create index fatos_cliente_prompt on public.fatos_cliente (cliente_id, tipo, chave)
  where estado = 'aprovado' and tipo <> 'observacao';
create index fatos_cliente_revisao on public.fatos_cliente (cliente_id, estado, atualizado_em desc);
create index fatos_cliente_auto_aprovados on public.fatos_cliente (criado_em desc)
  where origem = 'ia' and revisado_por is null and estado = 'aprovado';
create index fatos_cliente_origem_conversa on public.fatos_cliente (origem_conversa_id)
  where origem_conversa_id is not null;
create index fatos_cliente_substitui on public.fatos_cliente (substitui_id)
  where substitui_id is not null;

-- RLS habilitada sem FORCE: `force` sujeitaria o dono as politicas e, sem politicas, toda
-- funcao security definer veria zero linhas. Nenhum privilegio e concedido na tabela.
alter table public.fatos_cliente enable row level security;
revoke all on table public.fatos_cliente from public, anon, authenticated, service_role;

comment on table public.fatos_cliente is 'Memoria por cliente da Sofia: fatos tipados e auditaveis, com proveniencia, confianca, revisao e historico de substituicao. Alcancavel somente pelas funcoes RPC.';
comment on column public.fatos_cliente.tipo is 'Categoria do fato: endereco, preferencia, restricao_alimentar, formato_pedido ou observacao (interno, nunca exposto ao cliente).';
comment on column public.fatos_cliente.chave is 'Chave estavel dentro do tipo, no formato ^[a-z0-9_]{1,64}$; o par (tipo, chave) define o que se substitui.';
comment on column public.fatos_cliente.valor is 'Valor do fato, normalizado a montante (NFKC, sem controles nem invisiveis), entre 1 e 500 caracteres.';
comment on column public.fatos_cliente.origem is 'Proveniencia: cliente, operador, ia ou importado. A ordem de confianca imposta e cliente > operador > importado > ia.';
comment on column public.fatos_cliente.estado is 'Ciclo de vida: pendente, aprovado, rejeitado ou substituido. Apenas aprovado e lido pelo prompt e pelo cliente.';
comment on constraint ck_fatos_cliente_confianca on public.fatos_cliente is 'Confianca existe apenas para origem ia e sempre dentro de 0..1.';
comment on constraint ck_fatos_cliente_aprovacao on public.fatos_cliente is 'Um fato so fica aprovado por origem humana (cliente/operador), por revisor registrado, ou pela auto-aprovacao limitada: origem ia, confianca >= 0.85 e tipo fora de restricao_alimentar. O limite 0.85 vive nesta constraint, entao baixa-lo exige migracao.';
