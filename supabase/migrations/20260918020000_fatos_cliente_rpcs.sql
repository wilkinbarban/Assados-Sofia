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
