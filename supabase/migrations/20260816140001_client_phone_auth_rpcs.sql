-- Migração: RPCs Transacionais e Funções Atômicas para Autenticação Telefônica (Safe Data Foundation)
-- ID: 20260816140001_client_phone_auth_rpcs

-- 1. RPC: Solicitar Desafio OTP
CREATE OR REPLACE FUNCTION public.solicitar_desafio_otp(
    p_telefone VARCHAR,
    p_proposito public.tipo_desafio_otp,
    p_hash_codigo VARCHAR,
    p_ip_origem VARCHAR DEFAULT NULL,
    p_usuario_id UUID DEFAULT NULL
) RETURNS TABLE (
    p_desafio_id UUID,
    p_expira_em TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_desafio_id UUID;
    v_expira_em TIMESTAMP WITH TIME ZONE;
    v_bloqueio_ativo TIMESTAMPTZ;
    v_contagem_ip INTEGER;
    v_contagem_tel INTEGER;
BEGIN
    -- 1. Validar formato do telefone (DDD 41 Curitiba)
    IF p_telefone !~ '^55419[0-9]{8}$' THEN
        RAISE EXCEPTION 'TELEFONE_INVALIDO: O telefone deve seguir o padrão 55419XXXXXXXX';
    END IF;

    -- 2. Verificar Cooldown Ativo para o mesmo telefone
    SELECT bloqueio_reenvio_ate INTO v_bloqueio_ativo
    FROM public.desafios_otp
    WHERE telefone = p_telefone
      AND bloqueio_reenvio_ate > NOW()
    ORDER BY bloqueio_reenvio_ate DESC
    LIMIT 1;

    IF v_bloqueio_ativo IS NOT NULL THEN
        RAISE EXCEPTION 'COOLDOWN_ATIVO: Aguarde antes de solicitar um novo código';
    END IF;

    -- 3. Rate Limit por IP (máximo 10 solicitações nos últimos 10 minutos)
    IF p_ip_origem IS NOT NULL THEN
        SELECT COUNT(*) INTO v_contagem_ip
        FROM public.desafios_otp
        WHERE ip_origem = p_ip_origem
          AND data_criacao > NOW() - INTERVAL '10 minutes';

        IF v_contagem_ip >= 10 THEN
            RAISE EXCEPTION 'LIMITE_EXCEDIDO_IP: Muitas tentativas originadas deste endereço';
        END IF;
    END IF;

    -- 4. Rate Limit por Telefone (máximo 5 solicitações na última 1 hora)
    SELECT COUNT(*) INTO v_contagem_tel
    FROM public.desafios_otp
    WHERE telefone = p_telefone
      AND data_criacao > NOW() - INTERVAL '1 hour';

    IF v_contagem_tel >= 5 THEN
        RAISE EXCEPTION 'LIMITE_EXCEDIDO_TELEFONE: Limite de solicitações para este número atingido';
    END IF;

    -- 5. Invalidar desafios anteriores pendentes ou ativos para o mesmo telefone e propósito
    UPDATE public.desafios_otp
    SET status = 'expired'::public.status_desafio_otp
    WHERE telefone = p_telefone
      AND proposito = p_proposito
      AND status IN ('pending_delivery'::public.status_desafio_otp, 'active'::public.status_desafio_otp);

    -- 6. Inserir novo desafio com status 'pending_delivery'
    v_expira_em := NOW() + INTERVAL '10 minutes';

    INSERT INTO public.desafios_otp (
        telefone,
        usuario_id,
        proposito,
        status,
        hash_codigo,
        ip_origem,
        expira_em
    ) VALUES (
        p_telefone,
        p_usuario_id,
        p_proposito,
        'pending_delivery'::public.status_desafio_otp,
        p_hash_codigo,
        p_ip_origem,
        v_expira_em
    ) RETURNING id INTO v_desafio_id;

    RETURN QUERY SELECT v_desafio_id, v_expira_em;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 2. RPC: Ativar Desafio OTP (ou marcar falha de entrega)
CREATE OR REPLACE FUNCTION public.ativar_desafio_otp(
    p_desafio_id UUID,
    p_sucesso BOOLEAN,
    p_evidencia JSONB DEFAULT '{}'::jsonb,
    p_cooldown_segundos INTEGER DEFAULT 60
) RETURNS VOID AS $$
BEGIN
    IF p_sucesso THEN
        UPDATE public.desafios_otp
        SET status = 'active'::public.status_desafio_otp,
            evidencia_entrega = p_evidencia,
            bloqueio_reenvio_ate = NOW() + (p_cooldown_segundos || ' seconds')::INTERVAL
        WHERE id = p_desafio_id
          AND status = 'pending_delivery'::public.status_desafio_otp;
    ELSE
        UPDATE public.desafios_otp
        SET status = 'delivery_failed'::public.status_desafio_otp,
            evidencia_entrega = p_evidencia,
            bloqueio_reenvio_ate = NULL
        WHERE id = p_desafio_id
          AND status = 'pending_delivery'::public.status_desafio_otp;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 3. RPC: Finalizar Desafio OTP (Validação atômica, persistência de tentativas, consumo, mescla e auditoria)
DROP FUNCTION IF EXISTS public.finalizar_desafio_otp(UUID, VARCHAR, public.tipo_desafio_otp, VARCHAR, UUID, VARCHAR, VARCHAR);
CREATE OR REPLACE FUNCTION public.finalizar_desafio_otp(
    p_desafio_id UUID,
    p_telefone VARCHAR,
    p_proposito public.tipo_desafio_otp,
    p_hash_codigo VARCHAR,
    p_usuario_id UUID DEFAULT NULL,
    p_nome VARCHAR DEFAULT NULL,
    p_origem_verificacao VARCHAR DEFAULT 'whatsapp'
) RETURNS TABLE (
    sucesso BOOLEAN,
    codigo_erro TEXT,
    cliente_id UUID
) AS $$
DECLARE
    v_desafio RECORD;
    v_cliente_id UUID;
    v_cliente_existente_id UUID;
    v_cliente_rascunho_id UUID;
BEGIN
    -- 1. Bloquear registro do desafio para atomicidade
    SELECT * INTO v_desafio
    FROM public.desafios_otp
    WHERE id = p_desafio_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'DESAFIO_NAO_ENCONTRADO', NULL::UUID;
        RETURN;
    END IF;

    -- 2. Validar integridade e estado
    IF v_desafio.status <> 'active'::public.status_desafio_otp THEN
        RETURN QUERY SELECT FALSE, 'DESAFIO_INVALIDO', NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.telefone <> p_telefone THEN
        RETURN QUERY SELECT FALSE, 'TELEFONE_INCORRETO', NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.proposito <> p_proposito THEN
        RETURN QUERY SELECT FALSE, 'PROPOSITO_INVALIDO', NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.expira_em <= NOW() THEN
        UPDATE public.desafios_otp
        SET status = 'expired'::public.status_desafio_otp
        WHERE id = p_desafio_id;
        RETURN QUERY SELECT FALSE, 'DESAFIO_EXPIRADO', NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.tentativas >= v_desafio.max_tentativas THEN
        UPDATE public.desafios_otp
        SET status = 'expired'::public.status_desafio_otp
        WHERE id = p_desafio_id;
        RETURN QUERY SELECT FALSE, 'MAXIMO_TENTATIVAS_EXCEDIDO', NULL::UUID;
        RETURN;
    END IF;

    -- 3. Validar Hash do Código
    IF v_desafio.hash_codigo <> p_hash_codigo THEN
        UPDATE public.desafios_otp
        SET tentativas = tentativas + 1,
            status = CASE 
                WHEN tentativas + 1 >= max_tentativas THEN 'expired'::public.status_desafio_otp 
                ELSE status 
            END
        WHERE id = p_desafio_id;
        RETURN QUERY SELECT FALSE, 'CODIGO_INVALIDO', NULL::UUID;
        RETURN;
    END IF;

    -- 4. Marcar Desafio como Consumido
    UPDATE public.desafios_otp
    SET status = 'consumed'::public.status_desafio_otp,
        consumido_em = NOW()
    WHERE id = p_desafio_id;

    -- 5. Se for cadastro ou alteração de telefone, executar mescla / atualização de cliente
    IF p_proposito IN ('signup'::public.tipo_desafio_otp, 'phone_change'::public.tipo_desafio_otp) THEN
        -- Buscar cliente existente por telefone
        SELECT id INTO v_cliente_existente_id
        FROM public.clientes
        WHERE telefone = p_telefone
        LIMIT 1;

        -- Buscar rascunho web (se usuario_id foi passado)
        IF p_usuario_id IS NOT NULL THEN
            SELECT id INTO v_cliente_rascunho_id
            FROM public.clientes
            WHERE usuario_id = p_usuario_id
            LIMIT 1;
        END IF;

        IF v_cliente_existente_id IS NOT NULL THEN
            v_cliente_id := v_cliente_existente_id;

            -- Atualizar metadados de verificação e associar usuario_id
            UPDATE public.clientes
            SET usuario_id = COALESCE(p_usuario_id, usuario_id),
                nome = COALESCE(p_nome, nome),
                telefone_verificado_em = NOW(),
                telefone_verificado_origem = p_origem_verificacao
            WHERE id = v_cliente_id;

            -- Se existia um rascunho separado para o mesmo usuario_id, mesclar dependências e remover rascunho
            IF v_cliente_rascunho_id IS NOT NULL AND v_cliente_rascunho_id <> v_cliente_id THEN
                PERFORM public.mesclar_dependencias_cliente(v_cliente_rascunho_id, v_cliente_id);
                DELETE FROM public.clientes WHERE id = v_cliente_rascunho_id;
            END IF;
        ELSE
            IF v_cliente_rascunho_id IS NOT NULL THEN
                v_cliente_id := v_cliente_rascunho_id;
                UPDATE public.clientes
                SET telefone = p_telefone,
                    nome = COALESCE(p_nome, nome),
                    telefone_verificado_em = NOW(),
                    telefone_verificado_origem = p_origem_verificacao
                WHERE id = v_cliente_id;
            ELSE
                INSERT INTO public.clientes (
                    usuario_id,
                    nome,
                    telefone,
                    telefone_verificado_em,
                    telefone_verificado_origem
                ) VALUES (
                    p_usuario_id,
                    COALESCE(p_nome, 'Novo Cliente'),
                    p_telefone,
                    NOW(),
                    p_origem_verificacao
                ) RETURNING id INTO v_cliente_id;
            END IF;
        END IF;

        -- Registrar log de auditoria
        INSERT INTO public.logs_auditoria (usuario_id, acao, detalhes)
        VALUES (
            COALESCE(p_usuario_id, auth.uid()),
            'cliente_telefone_verificado',
            jsonb_build_object(
                'cliente_id', v_cliente_id,
                'telefone', p_telefone,
                'origem', p_origem_verificacao,
                'desafio_id', p_desafio_id,
                'proposito', p_proposito
            )
        );
    END IF;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_cliente_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 4. RPC: Consumir Desafio de Recuperação e Emitir Concessão (Recovery Grant)
DROP FUNCTION IF EXISTS public.consumir_desafio_recuperacao(UUID, VARCHAR, VARCHAR);
CREATE OR REPLACE FUNCTION public.consumir_desafio_recuperacao(
    p_desafio_id UUID,
    p_telefone VARCHAR,
    p_hash_codigo VARCHAR
) RETURNS TABLE (
    sucesso BOOLEAN,
    codigo_erro TEXT,
    token TEXT,
    concessao_id UUID
) AS $$
DECLARE
    v_desafio RECORD;
    v_usuario_id UUID;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_concessao_id UUID;
BEGIN
    SELECT * INTO v_desafio
    FROM public.desafios_otp
    WHERE id = p_desafio_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'DESAFIO_NAO_ENCONTRADO', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.status <> 'active'::public.status_desafio_otp THEN
        RETURN QUERY SELECT FALSE, 'DESAFIO_INVALIDO', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.proposito <> 'recovery'::public.tipo_desafio_otp THEN
        RETURN QUERY SELECT FALSE, 'PROPOSITO_INVALIDO', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.telefone <> p_telefone THEN
        RETURN QUERY SELECT FALSE, 'TELEFONE_INCORRETO', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.expira_em <= NOW() THEN
        UPDATE public.desafios_otp SET status = 'expired'::public.status_desafio_otp WHERE id = p_desafio_id;
        RETURN QUERY SELECT FALSE, 'DESAFIO_EXPIRADO', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.tentativas >= v_desafio.max_tentativas THEN
        UPDATE public.desafios_otp SET status = 'expired'::public.status_desafio_otp WHERE id = p_desafio_id;
        RETURN QUERY SELECT FALSE, 'MAXIMO_TENTATIVAS_EXCEDIDO', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_desafio.hash_codigo <> p_hash_codigo THEN
        UPDATE public.desafios_otp
        SET tentativas = tentativas + 1,
            status = CASE WHEN tentativas + 1 >= max_tentativas THEN 'expired'::public.status_desafio_otp ELSE status END
        WHERE id = p_desafio_id;
        RETURN QUERY SELECT FALSE, 'CODIGO_INVALIDO', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Consumir desafio
    UPDATE public.desafios_otp
    SET status = 'consumed'::public.status_desafio_otp,
        consumido_em = NOW()
    WHERE id = p_desafio_id;

    -- Identificar usuário pelo telefone
    SELECT usuario_id INTO v_usuario_id
    FROM public.clientes
    WHERE telefone = p_telefone AND usuario_id IS NOT NULL
    LIMIT 1;

    IF v_usuario_id IS NULL THEN
        SELECT id INTO v_usuario_id
        FROM auth.users
        WHERE phone = p_telefone
        LIMIT 1;
    END IF;

    -- Gerar token criptográfico aleatório
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- Revogar concessões ativas anteriores para este telefone
    UPDATE public.concessoes_recuperacao
    SET aplicado_em = NOW()
    WHERE telefone = p_telefone AND aplicado_em IS NULL;

    -- Criar nova concessão de recuperação com validade de 15 minutos
    INSERT INTO public.concessoes_recuperacao (
        desafio_id,
        telefone,
        usuario_id,
        token_hash,
        expira_em
    ) VALUES (
        p_desafio_id,
        p_telefone,
        v_usuario_id,
        v_token_hash,
        NOW() + INTERVAL '15 minutes'
    ) RETURNING id INTO v_concessao_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_raw_token, v_concessao_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 5. RPC: Aplicar Concessão de Recuperação
CREATE OR REPLACE FUNCTION public.aplicar_concessao_recuperacao(
    p_concessao_id UUID,
    p_token TEXT
) RETURNS TABLE (
    sucesso BOOLEAN,
    usuario_id UUID
) AS $$
DECLARE
    v_concessao RECORD;
    v_token_hash TEXT;
BEGIN
    v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

    SELECT * INTO v_concessao
    FROM public.concessoes_recuperacao
    WHERE id = p_concessao_id
    FOR UPDATE;

    IF FOUND AND v_concessao.aplicado_em IS NULL 
             AND v_concessao.expira_em > NOW() 
             AND v_concessao.token_hash = v_token_hash THEN
        UPDATE public.concessoes_recuperacao
        SET aplicado_em = NOW()
        WHERE id = p_concessao_id;

        RETURN QUERY SELECT TRUE, v_concessao.usuario_id;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::UUID;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;
