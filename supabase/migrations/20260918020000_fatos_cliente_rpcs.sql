-- Fatos por cliente da Sofia (memoria_cliente), slice 2: funcoes de backend (escrita e leitura
-- do prompt). O escritor nao aceita estado de aprovacao: o unico controle e `p_forcar_pendente`,
-- que so torna a aprovacao mais dificil, e a autoridade do limite 0.85 continua sendo
-- ck_fatos_cliente_aprovacao (design 4.1 e 10). Sem `alter function ... owner to supabase_admin`:
-- o harness local afirma exatamente oito transferencias de posse (design 9.1).

create function public.registrar_fato_cliente(
  p_cliente_id uuid,
  p_tipo text,
  p_chave text,
  p_valor text,
  p_origem text,
  p_origem_conversa_id uuid default null,
  p_confianca numeric default null,
  p_forcar_pendente boolean default false
) returns table(fato_id uuid, estado text, substituido_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_live public.fatos_cliente%rowtype;
  v_rank integer;
  v_live_rank integer;
  v_estado text;
  v_substituido uuid;
  v_fato_id uuid;
begin
  -- Autoridade antes da forma, e a forma antes da existencia: um chamador nao autorizado nao
  -- pode usar codigos de erro como oraculo de existencia.
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_SERVICE_ROLE_REQUIRED';
  end if;
  if p_cliente_id is null
     or p_tipo is null or p_tipo not in ('endereco','preferencia','restricao_alimentar','formato_pedido','observacao')
     or p_chave is null or p_chave !~ '^[a-z0-9_]{1,64}$'
     or p_valor is null or p_valor = '' or p_valor <> pg_catalog.btrim(p_valor)
     or char_length(p_valor) > 500
     or p_valor ~ '[[:cntrl:]]'
     or p_valor ~ '[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]'
     or p_origem is null or p_origem not in ('cliente','operador','ia','importado') then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_ENTRADA_INVALIDA';
  end if;
  -- Uma inferencia sem confianca nunca alcancaria a auto-aprovacao limitada e ficaria pendente
  -- para sempre; exigir a confianca transforma isso em erro de entrada explicito.
  if (p_origem = 'ia' and (p_confianca is null or p_confianca < 0 or p_confianca > 1))
     or (p_origem <> 'ia' and p_confianca is not null) then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_CONFIANCA_INVALIDA';
  end if;
  if p_origem_conversa_id is not null then
    perform 1 from public.conversas c where c.id = p_origem_conversa_id and c.cliente_id = p_cliente_id;
    if not found then
      raise exception using errcode = '22023', message = 'SOFIA_FATO_CONVERSA_INVALIDA';
    end if;
  end if;
  perform 1 from public.clientes c where c.id = p_cliente_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_CLIENTE_NAO_ENCONTRADO';
  end if;

  -- Serializa a chave: uma corrida da mesma chave resolve como substituicao, nunca como 23505.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_cliente_id::text || '|' || p_tipo || '|' || p_chave, 91423));
  select f.* into v_live from public.fatos_cliente f
    where f.cliente_id = p_cliente_id and f.tipo = p_tipo and f.chave = p_chave
      and f.estado in ('pendente','aprovado')
    for update;

  v_rank := case p_origem when 'cliente' then 4 when 'operador' then 3 when 'importado' then 2 else 1 end;
  v_estado := case
    when p_forcar_pendente then 'pendente'
    when p_origem in ('cliente','operador') then 'aprovado'
    when p_origem = 'importado' then 'pendente'
    when p_tipo = 'restricao_alimentar' then 'pendente'
    when p_confianca >= 0.85 then 'aprovado'
    else 'pendente' end;
  v_substituido := null;

  if found then
    v_live_rank := case v_live.origem when 'cliente' then 4 when 'operador' then 3 when 'importado' then 2 else 1 end;
    -- Proveniencia acima de recencia: uma fonte estritamente menos confiavel nao substitui a
    -- vigente, e uma repeticao identica de mesmo rank e um no-op idempotente.
    if v_live_rank > v_rank or (v_live_rank = v_rank and v_live.valor = p_valor) then
      return query select v_live.id, v_live.estado, null::uuid;
      return;
    end if;
    update public.fatos_cliente f set estado = 'substituido', atualizado_em = pg_catalog.now()
      where f.id = v_live.id;
    v_substituido := v_live.id;
  end if;

  -- Durabilidade da recusa: sem fato vigente, re-inferir exatamente o valor recusado nunca
  -- auto-aprova; a recusa permanece no historico e nao e substituida.
  if v_substituido is null and p_origem = 'ia'
     and exists (select 1 from public.fatos_cliente f
                  where f.cliente_id = p_cliente_id and f.tipo = p_tipo and f.chave = p_chave
                    and f.estado = 'rejeitado' and f.valor = p_valor) then
    v_estado := 'pendente';
  end if;

  insert into public.fatos_cliente(cliente_id, tipo, chave, valor, origem, origem_conversa_id, confianca, estado, substitui_id)
  values (p_cliente_id, p_tipo, p_chave, p_valor, p_origem, p_origem_conversa_id,
          case when p_origem = 'ia' then p_confianca else null end, v_estado, v_substituido)
  returning id into v_fato_id;
  return query select v_fato_id, v_estado, v_substituido;
end
$$;

create function public.buscar_fatos_para_prompt(
  p_cliente_id uuid,
  p_limite integer default 20
) returns table(tipo text, chave text, valor text)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_SERVICE_ROLE_REQUIRED';
  end if;
  -- O teto de 20 vive na superficie para que nenhum chamador possa eleva-lo.
  if p_cliente_id is null or p_limite is null or p_limite < 1 or p_limite > 20 then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_ENTRADA_INVALIDA';
  end if;
  return query
    select f.tipo, f.chave, f.valor
      from public.fatos_cliente f
      where f.cliente_id = p_cliente_id and f.estado = 'aprovado' and f.tipo <> 'observacao'
      order by f.tipo, f.chave
      limit p_limite;
end
$$;

comment on function public.registrar_fato_cliente(uuid,text,text,text,text,uuid,numeric,boolean) is
  'Registra um fato do cliente. Nao existe parametro de estado: apenas p_forcar_pendente, que so dificulta a aprovacao; o estado e derivado da origem, do tipo e da confianca, e ck_fatos_cliente_aprovacao continua sendo a autoridade do limite 0.85. Preserva a precedencia cliente > operador > importado > ia, a durabilidade da recusa e serializa a chave com pg_advisory_xact_lock.';
comment on function public.buscar_fatos_para_prompt(uuid,integer) is
  'Leitura de fatos aprovados para o prompt: somente estado aprovado e tipo fora de observacao, no maximo 20 linhas por chamada. Um cliente desconhecido devolve conjunto vazio em vez de P0002, para nao transformar um problema de dados em indisponibilidade da Sofia.';

revoke all on function public.registrar_fato_cliente(uuid,text,text,text,text,uuid,numeric,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.registrar_fato_cliente(uuid,text,text,text,text,uuid,numeric,boolean)
  to service_role;

revoke all on function public.buscar_fatos_para_prompt(uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.buscar_fatos_para_prompt(uuid,integer) to service_role;

-- Slice 3: superficie de operador e de proprietario (design 4.2 a 4.6 e 9.2). As cinco funcoes
-- seguem as regras de casa do slice 2: autoridade antes da forma, forma antes da existencia,
-- mensagens SOFIA_* sem `details`, referencias qualificadas e `search_path` vazio. A revisao usa
-- exatamente a mesma expressao de trava por chave do escritor (namespace 91423), para que revisao
-- e inferencia concorrentes da mesma chave se serializem pela mesma trava. Nenhuma delas e
-- concedida a service_role: um backend que precise de visao de operador nao deve ter uma.

create function public.listar_fatos_cliente(
  p_cliente_id uuid,
  p_estados text[] default null,
  p_limite integer default 200
) returns table(
  fato_id uuid, tipo text, chave text, valor text, origem text,
  origem_conversa_id uuid, confianca numeric, estado text,
  revisado_por uuid, revisado_em timestamptz, substitui_id uuid,
  criado_em timestamptz, atualizado_em timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.tem_funcoes(array[
    'admin'::public.tipo_funcao,
    'supervisor'::public.tipo_funcao,
    'vendedor'::public.tipo_funcao
  ]) then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_OPERADOR_REQUERIDO';
  end if;
  -- Um filtro de estado desconhecido devolveria uma lista vazia silenciosa na tela do operador.
  if p_cliente_id is null or p_limite is null or p_limite < 1 or p_limite > 500
     or (p_estados is not null and exists (
           select 1 from pg_catalog.unnest(p_estados) e
            where e is null or e not in ('pendente','aprovado','rejeitado','substituido'))) then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_ENTRADA_INVALIDA';
  end if;
  perform 1 from public.clientes c where c.id = p_cliente_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_CLIENTE_NAO_ENCONTRADO';
  end if;
  -- Ordem estavel para a fila de revisao: aprovado primeiro, mais recente antes, todos os estados.
  return query
    select f.id, f.tipo, f.chave, f.valor, f.origem, f.origem_conversa_id, f.confianca, f.estado,
           f.revisado_por, f.revisado_em, f.substitui_id, f.criado_em, f.atualizado_em
      from public.fatos_cliente f
      where f.cliente_id = p_cliente_id
        and (p_estados is null or f.estado = any(p_estados))
      order by f.estado, f.atualizado_em desc
      limit p_limite;
end
$$;

create function public.revisar_fato_cliente(
  p_fato_id uuid,
  p_decisao text,
  p_valor text default null
) returns table(fato_id uuid, estado text, valor text, origem text)
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente_id uuid;
  v_tipo text;
  v_chave text;
  v_fato public.fatos_cliente%rowtype;
begin
  if not public.tem_funcoes(array[
    'admin'::public.tipo_funcao,
    'supervisor'::public.tipo_funcao,
    'vendedor'::public.tipo_funcao
  ]) then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_OPERADOR_REQUERIDO';
  end if;
  if p_fato_id is null
     or p_decisao is null or p_decisao not in ('aprovar','rejeitar','corrigir')
     or (p_decisao = 'corrigir' and (p_valor is null or p_valor = ''
         or p_valor <> pg_catalog.btrim(p_valor) or char_length(p_valor) > 500
         or p_valor ~ '[[:cntrl:]]'
         or p_valor ~ '[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]'))
     or (p_decisao <> 'corrigir' and p_valor is not null) then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_ENTRADA_INVALIDA';
  end if;
  select f.cliente_id, f.tipo, f.chave into v_cliente_id, v_tipo, v_chave
    from public.fatos_cliente f where f.id = p_fato_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_NAO_ENCONTRADO';
  end if;
  -- Mesma trava por chave do escritor: a revisao nunca corre solta contra uma inferencia.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_cliente_id::text || '|' || v_tipo || '|' || v_chave, 91423));
  select f.* into v_fato from public.fatos_cliente f where f.id = p_fato_id for update;
  -- Rejeitado e substituido sao historico terminal: reaprovar exigiria colidir com a chave.
  if v_fato.estado in ('rejeitado','substituido') then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_NAO_REVISAVEL';
  end if;
  -- `corrigir` limpa a confianca porque o valor armazenado deixou de ser a inferencia do modelo;
  -- aprovar e rejeitar a preservam. A origem nunca muda, e o revisor e sempre registrado.
  update public.fatos_cliente f
     set estado = case p_decisao when 'rejeitar' then 'rejeitado' else 'aprovado' end,
         valor = case when p_decisao = 'corrigir' then p_valor else f.valor end,
         confianca = case when p_decisao = 'corrigir' then null else f.confianca end,
         revisado_por = auth.uid(),
         revisado_em = pg_catalog.now(),
         atualizado_em = pg_catalog.now()
   where f.id = p_fato_id;
  return query select f.id, f.estado, f.valor, f.origem
    from public.fatos_cliente f where f.id = p_fato_id;
end
$$;

create function public.meus_fatos_cliente(p_limite integer default 200)
returns table(
  fato_id uuid, tipo text, chave text, valor text, origem text,
  criado_em timestamptz, atualizado_em timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_cliente_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_NAO_AUTENTICADO';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_ENTRADA_INVALIDA';
  end if;
  select c.id into v_cliente_id from public.clientes c where c.usuario_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_CLIENTE_NAO_ENCONTRADO';
  end if;
  -- Projecao estreita de proposito: o cliente ve a afirmacao e seu autor, nunca a cadeia interna
  -- de revisao nem a certeza do modelo, e `observacao` nunca e exposta.
  return query
    select f.id, f.tipo, f.chave, f.valor, f.origem, f.criado_em, f.atualizado_em
      from public.fatos_cliente f
      where f.cliente_id = v_cliente_id and f.estado = 'aprovado' and f.tipo <> 'observacao'
      order by f.tipo, f.chave
      limit p_limite;
end
$$;

create function public.corrigir_meu_fato_cliente(p_fato_id uuid, p_valor text)
returns table(fato_id uuid, valor text, estado text, origem text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_cliente_id uuid;
  v_fato public.fatos_cliente%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_NAO_AUTENTICADO';
  end if;
  if p_fato_id is null or p_valor is null or p_valor = ''
     or p_valor <> pg_catalog.btrim(p_valor) or char_length(p_valor) > 500
     or p_valor ~ '[[:cntrl:]]'
     or p_valor ~ '[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]' then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_ENTRADA_INVALIDA';
  end if;
  select c.id into v_cliente_id from public.clientes c where c.usuario_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_NAO_ENCONTRADO';
  end if;
  select f.* into v_fato from public.fatos_cliente f where f.id = p_fato_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_NAO_ENCONTRADO';
  end if;
  if v_fato.cliente_id <> v_cliente_id then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_NAO_AUTORIZADO';
  end if;
  if v_fato.tipo = 'observacao' then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_NAO_EXPOSTO';
  end if;
  -- A superficie do cliente so mostra fatos aprovados; um pendente e `nao encontrado` para ele.
  if v_fato.estado <> 'aprovado' then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_NAO_ENCONTRADO';
  end if;
  -- Retificacao LGPD no lugar, nunca substituicao: preserva a identidade do fato e deixa um unico
  -- fato vigente para a chave. `revisado_por`/`revisado_em` permanecem como historico da revisao.
  update public.fatos_cliente f
     set valor = p_valor, origem = 'cliente', estado = 'aprovado', confianca = null,
         origem_conversa_id = null, atualizado_em = pg_catalog.now()
   where f.id = p_fato_id;
  return query select f.id, f.valor, f.estado, f.origem
    from public.fatos_cliente f where f.id = p_fato_id;
end
$$;

create function public.recusar_meu_fato_cliente(p_fato_id uuid)
returns table(fato_id uuid, estado text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_cliente_id uuid;
  v_fato public.fatos_cliente%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_NAO_AUTENTICADO';
  end if;
  if p_fato_id is null then
    raise exception using errcode = '22023', message = 'SOFIA_FATO_ENTRADA_INVALIDA';
  end if;
  select c.id into v_cliente_id from public.clientes c where c.usuario_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_NAO_ENCONTRADO';
  end if;
  select f.* into v_fato from public.fatos_cliente f where f.id = p_fato_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_NAO_ENCONTRADO';
  end if;
  if v_fato.cliente_id <> v_cliente_id then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_NAO_AUTORIZADO';
  end if;
  if v_fato.tipo = 'observacao' then
    raise exception using errcode = '42501', message = 'SOFIA_FATO_NAO_EXPOSTO';
  end if;
  if v_fato.estado <> 'aprovado' then
    raise exception using errcode = 'P0002', message = 'SOFIA_FATO_NAO_ENCONTRADO';
  end if;
  -- Recusar rejeita a afirmacao: o fato e retido e a proveniencia nao e reescrita.
  update public.fatos_cliente f set estado = 'rejeitado', atualizado_em = pg_catalog.now()
   where f.id = p_fato_id;
  return query select f.id, f.estado from public.fatos_cliente f where f.id = p_fato_id;
end
$$;

comment on function public.listar_fatos_cliente(uuid,text[],integer) is
  'Fila de revisao do operador: devolve todos os estados com proveniencia, ordenados por estado e atualizado_em desc, no maximo 500 linhas. Exige admin, supervisor ou vendedor via public.tem_funcoes e trata cliente desconhecido como P0002, para que um id errado nao pareca um cliente sem fatos.';
comment on function public.revisar_fato_cliente(uuid,text,text) is
  'Decisao do operador sobre um fato: aprovar, rejeitar ou corrigir. Registra revisado_por e revisado_em; corrigir grava o valor normalizado e limpa a confianca, enquanto aprovar e rejeitar a preservam. Rejeitado e substituido sao historico terminal e nao podem ser revisados.';
comment on function public.meus_fatos_cliente(integer) is
  'Leitura do proprietario: resolve o cliente por clientes.usuario_id = auth.uid() e devolve somente fatos aprovados e nunca observacao, com projecao estreita (sem confianca, revisor ou historico de substituicao).';
comment on function public.corrigir_meu_fato_cliente(uuid,text) is
  'Retificacao LGPD do proprietario: atualiza o fato no lugar com origem cliente e estado aprovado, limpa confianca e origem_conversa_id e preserva revisado_por/revisado_em. Fatos de outro cliente sao recusados com 42501 e observacao nunca e exposta.';
comment on function public.recusar_meu_fato_cliente(uuid) is
  'Recusa do proprietario: marca o proprio fato aprovado como rejeitado mantendo a linha e sem reescrever origem, confianca nem origem_conversa_id. Mesmas recusas de posse e de observacao da correcao.';

revoke all on function public.listar_fatos_cliente(uuid,text[],integer)
  from public, anon, authenticated, service_role;
grant execute on function public.listar_fatos_cliente(uuid,text[],integer) to authenticated;

revoke all on function public.revisar_fato_cliente(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.revisar_fato_cliente(uuid,text,text) to authenticated;

revoke all on function public.meus_fatos_cliente(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.meus_fatos_cliente(integer) to authenticated;

revoke all on function public.corrigir_meu_fato_cliente(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.corrigir_meu_fato_cliente(uuid,text) to authenticated;

revoke all on function public.recusar_meu_fato_cliente(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.recusar_meu_fato_cliente(uuid) to authenticated;
