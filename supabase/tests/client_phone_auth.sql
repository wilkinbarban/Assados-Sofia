-- Testes pgTAP para Fase 1: Safe Data Foundation (Client Phone-First Auth)
begin;
set local search_path = public, auth, extensions;
select plan(7);

-- Fixtures de usuários e perfis para os testes
insert into auth.users (id, instance_id, aud, role, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('88888888-8888-4888-8888-888888888881', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator@example.test', null, '', now(), null, '{}', '{}', now(), now()),
  ('88888888-8888-4888-8888-888888888882', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-a@example.test', '5541988880001', '', null, now(), '{}', '{}', now(), now()),
  ('88888888-8888-4888-8888-888888888883', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-b@example.test', '5541988880002', '', null, null, '{}', '{}', now(), now())
on conflict (id) do nothing;

update public.perfis set
  funcao = case id
    when '88888888-8888-4888-8888-888888888881' then 'admin'::public.tipo_funcao
    else 'cliente'::public.tipo_funcao
  end,
  ativo = true
where id in ('88888888-8888-4888-8888-888888888881', '88888888-8888-4888-8888-888888888882', '88888888-8888-4888-8888-888888888883');

-- -----------------------------------------------------------------------------
-- Teste 1: Estrutura da tabela clientes (email opcional e evidência explícita)
-- -----------------------------------------------------------------------------
do $$
declare
  v_cliente_id uuid;
begin
  -- Inserir cliente com email opcional e metadados de verificação explícita
  insert into public.clientes (
    usuario_id, nome, telefone, email, telefone_verificado_em, telefone_verificado_origem
  ) values (
    '88888888-8888-4888-8888-888888888882',
    'Cliente A Verificado',
    '5541988880001',
    'opcional@cliente.test',
    now(),
    'whatsapp_evolution'
  ) returning id into v_cliente_id;

  if v_cliente_id is null then
    raise exception 'Falha ao inserir cliente com novos campos de verificação';
  end if;
end $$;
select pass('1. Tabela clientes aceita email opcional e campos explícitos de verificação');

-- -----------------------------------------------------------------------------
-- Teste 2: Solicitação e ativação de desafio OTP com HMAC e rate limiting
-- -----------------------------------------------------------------------------
do $$
declare
  v_desafio_id uuid;
  v_hash text := encode(digest('123456', 'sha256'), 'hex');
  v_status text;
  v_cooldown timestamptz;
begin
  -- 1. Solicitar desafio OTP (inicia como pending_delivery)
  select p_desafio_id into v_desafio_id
  from public.solicitar_desafio_otp(
    p_telefone := '5541988880001',
    p_proposito := 'signup'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_ip_origem := '192.168.1.100',
    p_usuario_id := null
  );

  select status into v_status from public.desafios_otp where id = v_desafio_id;
  if v_status <> 'pending_delivery' then
    raise exception 'Desafio deveria iniciar como pending_delivery, mas status=%', v_status;
  end if;

  -- 2. Ativar desafio após confirmação de entrega do provedor
  perform public.ativar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_sucesso := true,
    p_evidencia := '{"provider": "evolution", "messageId": "evo-123"}'::jsonb,
    p_cooldown_segundos := 60
  );

  select status, bloqueio_reenvio_ate into v_status, v_cooldown
  from public.desafios_otp where id = v_desafio_id;

  if v_status <> 'active' or v_cooldown is null then
    raise exception 'Desafio não ativado corretamente ou sem cooldown configurado';
  end if;

  -- 3. Tentar solicitar novamente dentro do cooldown (deve falhar por rate limit)
  begin
    perform public.solicitar_desafio_otp(
      p_telefone := '5541988880001',
      p_proposito := 'signup'::public.tipo_desafio_otp,
      p_hash_codigo := v_hash,
      p_ip_origem := '192.168.1.100',
      p_usuario_id := null
    );
    raise exception 'Rate limit de reenvio falhou ao permitir nova solicitação dentro do cooldown';
  exception
    when others then
      if sqlerrm not like '%COOLDOWN_ATIVO%' and sqlerrm not like '%LIMITE_EXCEDIDO%' then
        raise exception 'Erro inesperado no rate limit: %', sqlerrm;
      end if;
  end;
end $$;
select pass('2. Solicitação, ativação e rate limiting de desafios OTP funcionam');

-- -----------------------------------------------------------------------------
-- Teste 3: Falha de entrega marca delivery_failed sem ativar cooldown
-- -----------------------------------------------------------------------------
do $$
declare
  v_desafio_id uuid;
  v_hash text := encode(digest('654321', 'sha256'), 'hex');
  v_status text;
  v_cooldown timestamptz;
begin
  select p_desafio_id into v_desafio_id
  from public.solicitar_desafio_otp(
    p_telefone := '5541988880003',
    p_proposito := 'signup'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_ip_origem := '192.168.1.101',
    p_usuario_id := null
  );

  -- Registrar falha na entrega
  perform public.ativar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_sucesso := false,
    p_evidencia := '{"provider": "meta", "error": "unreachable"}'::jsonb,
    p_cooldown_segundos := 60
  );

  select status, bloqueio_reenvio_ate into v_status, v_cooldown
  from public.desafios_otp where id = v_desafio_id;

  if v_status <> 'delivery_failed' or v_cooldown is not null then
    raise exception 'Falha de entrega deveria marcar delivery_failed e não deixar cooldown ativo';
  end if;
end $$;
select pass('3. Falha de entrega resulta em delivery_failed sem cooldown ativo');

-- -----------------------------------------------------------------------------
-- Teste 4: Isolamento estrito de propósitos (purpose isolation)
-- -----------------------------------------------------------------------------
do $$
declare
  v_desafio_id uuid;
  v_hash text := encode(digest('112233', 'sha256'), 'hex');
  v_sucesso boolean;
  v_erro text;
begin
  -- Criar desafio com propósito signup
  select p_desafio_id into v_desafio_id
  from public.solicitar_desafio_otp(
    p_telefone := '5541988880004',
    p_proposito := 'signup'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_ip_origem := '192.168.1.102',
    p_usuario_id := null
  );

  perform public.ativar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_sucesso := true,
    p_evidencia := '{}'::jsonb,
    p_cooldown_segundos := 60
  );

  -- Tentar validar com propósito recovery (deve falhar)
  select sucesso, codigo_erro into v_sucesso, v_erro
  from public.finalizar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_telefone := '5541988880004',
    p_proposito := 'recovery'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_usuario_id := null,
    p_nome := 'Teste'
  );

  if v_sucesso or v_erro <> 'PROPOSITO_INVALIDO' then
    raise exception 'Validação com propósito cruzado (cross-purpose) teve sucesso indevido: sucesso=%, erro=%', v_sucesso, v_erro;
  end if;
end $$;
select pass('4. Isolamento estrito de propósitos impede validação cruzada');

-- -----------------------------------------------------------------------------
-- Teste 5: Limite de tentativas e expiração de desafios OTP
-- -----------------------------------------------------------------------------
do $$
declare
  v_desafio_id uuid;
  v_hash_correto text := encode(digest('999999', 'sha256'), 'hex');
  v_hash_errado text := encode(digest('000000', 'sha256'), 'hex');
  v_status text;
  v_tentativas integer;
  v_sucesso boolean;
  v_erro text;
begin
  select p_desafio_id into v_desafio_id
  from public.solicitar_desafio_otp(
    p_telefone := '5541988880005',
    p_proposito := 'signup'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash_correto,
    p_ip_origem := '192.168.1.103',
    p_usuario_id := null
  );

  perform public.ativar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_sucesso := true,
    p_evidencia := '{}'::jsonb,
    p_cooldown_segundos := 60
  );

  -- 3 tentativas erradas consecutivas
  for i in 1..3 loop
    select sucesso, codigo_erro into v_sucesso, v_erro
    from public.finalizar_desafio_otp(
      p_desafio_id := v_desafio_id,
      p_telefone := '5541988880005',
      p_proposito := 'signup'::public.tipo_desafio_otp,
      p_hash_codigo := v_hash_errado,
      p_usuario_id := null,
      p_nome := 'Teste'
    );
  end loop;

  select status, tentativas into v_status, v_tentativas
  from public.desafios_otp where id = v_desafio_id;

  if v_status <> 'expired' or v_tentativas < 3 then
    raise exception 'Desafio deveria ter status=expired e tentativas=3, mas status=%, tentativas=%', v_status, v_tentativas;
  end if;
end $$;
select pass('5. Desafio atinge limite de tentativas e é invalidado');

-- -----------------------------------------------------------------------------
-- Teste 6: Finalização atômica, consumo único e mescla de cliente
-- -----------------------------------------------------------------------------
do $$
declare
  v_desafio_id uuid;
  v_hash text := encode(digest('555555', 'sha256'), 'hex');
  v_cliente_existente_id uuid;
  v_cliente_final_id uuid;
  v_verificado_em timestamptz;
  v_sucesso boolean;
  v_erro text;
begin
  -- Criar registro órfão prévio do WhatsApp
  insert into public.clientes (nome, telefone)
  values ('Cliente Órfão WhatsApp', '5541988880006')
  returning id into v_cliente_existente_id;

  select p_desafio_id into v_desafio_id
  from public.solicitar_desafio_otp(
    p_telefone := '5541988880006',
    p_proposito := 'signup'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_ip_origem := '192.168.1.104',
    p_usuario_id := '88888888-8888-4888-8888-888888888883'
  );

  perform public.ativar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_sucesso := true,
    p_evidencia := '{"provider": "telegram"}'::jsonb,
    p_cooldown_segundos := 60
  );

  -- Finalizar desafio e associar ao usuario_id
  select sucesso, codigo_erro, cliente_id into v_sucesso, v_erro, v_cliente_final_id
  from public.finalizar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_telefone := '5541988880006',
    p_proposito := 'signup'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_usuario_id := '88888888-8888-4888-8888-888888888883',
    p_nome := 'Cliente B Vinculado',
    p_origem_verificacao := 'telegram'
  );

  if not v_sucesso or v_cliente_final_id is null then
    raise exception 'Falha ao finalizar desafio: sucesso=%, erro=%', v_sucesso, v_erro;
  end if;

  -- Verificar que o cliente existente foi mesclado com o usuario_id e verificado
  select telefone_verificado_em into v_verificado_em
  from public.clientes
  where id = v_cliente_final_id and usuario_id = '88888888-8888-4888-8888-888888888883';

  if v_verificado_em is null then
    raise exception 'Evidência de verificação ausente no cliente final';
  end if;

  -- Tentativa de re-consumo do mesmo desafio deve falhar
  select sucesso, codigo_erro into v_sucesso, v_erro
  from public.finalizar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_telefone := '5541988880006',
    p_proposito := 'signup'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_usuario_id := '88888888-8888-4888-8888-888888888883',
    p_nome := 'Tentativa Replay'
  );

  if v_sucesso then
    raise exception 'Re-consumo de desafio já consumido teve sucesso indevido';
  end if;
end $$;
select pass('6. Finalização atômica executa mescla e impede re-consumo');

-- -----------------------------------------------------------------------------
-- Teste 7: Concessões de recuperação de senha (Recovery Grants)
-- -----------------------------------------------------------------------------
do $$
declare
  v_desafio_id uuid;
  v_hash text := encode(digest('777777', 'sha256'), 'hex');
  v_concessao_token text;
  v_concessao_id uuid;
  v_sucesso boolean;
  v_erro text;
  v_valido boolean;
begin
  select p_desafio_id into v_desafio_id
  from public.solicitar_desafio_otp(
    p_telefone := '5541988880007',
    p_proposito := 'recovery'::public.tipo_desafio_otp,
    p_hash_codigo := v_hash,
    p_ip_origem := '192.168.1.105',
    p_usuario_id := '88888888-8888-4888-8888-888888888882'
  );

  perform public.ativar_desafio_otp(
    p_desafio_id := v_desafio_id,
    p_sucesso := true,
    p_evidencia := '{}'::jsonb,
    p_cooldown_segundos := 60
  );

  -- Consumir OTP de recuperação e gerar concessão
  select sucesso, codigo_erro, token, concessao_id into v_sucesso, v_erro, v_concessao_token, v_concessao_id
  from public.consumir_desafio_recuperacao(
    p_desafio_id := v_desafio_id,
    p_telefone := '5541988880007',
    p_hash_codigo := v_hash
  );

  if not v_sucesso or v_concessao_token is null or v_concessao_id is null then
    raise exception 'Falha ao emitir concessão de recuperação: sucesso=%, erro=%', v_sucesso, v_erro;
  end if;

  -- Aplicar concessão de recuperação após redefinição de senha
  select sucesso into v_valido
  from public.aplicar_concessao_recuperacao(
    p_concessao_id := v_concessao_id,
    p_token := v_concessao_token
  );

  if not v_valido then
    raise exception 'Falha ao validar/aplicar concessão de recuperação';
  end if;

  -- Reutilização da mesma concessão deve falhar
  select sucesso into v_valido
  from public.aplicar_concessao_recuperacao(
    p_concessao_id := v_concessao_id,
    p_token := v_concessao_token
  );

  if v_valido then
    raise exception 'Concessão de recuperação permitiu reutilização';
  end if;
end $$;
select pass('7. Concessão de recuperação de senha funciona com uso único e revogação');

select * from finish();
rollback;
