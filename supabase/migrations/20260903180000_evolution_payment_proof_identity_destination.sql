-- Authoritative canonical Evolution payment-proof intake destination. The per-phone
-- transaction advisory lock makes concurrent first deliveries converge on one customer
-- and one open persistence conversation without touching legacy message/proof tables.
CREATE OR REPLACE FUNCTION public.resolve_evolution_payment_proof_identity_destination(
  p_phone text,
  p_display_name text
)
RETURNS TABLE(customer_id uuid, conversation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_conversation_id uuid;
  v_display_name text;
BEGIN
  IF auth.role() <> 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVOLUTION_PAYMENT_PROOF_IDENTITY_DESTINATION_UNAUTHORIZED';
  END IF;

  IF p_phone IS NULL OR p_phone !~ '^55419[0-9]{8}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVOLUTION_PAYMENT_PROOF_IDENTITY_DESTINATION_INVALID_PHONE';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resolve_evolution_payment_proof_identity_destination:' || p_phone, 0)
  );

  SELECT id INTO v_customer_id
  FROM public.clientes
  WHERE telefone = p_phone
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    v_display_name := coalesce(nullif(left(btrim(p_display_name), 100), ''), 'Contato Evolution');
    INSERT INTO public.clientes (usuario_id, nome, telefone)
    VALUES (NULL, v_display_name, p_phone)
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT id INTO v_conversation_id
  FROM public.conversas
  WHERE cliente_id = v_customer_id AND status = 'aberta'
  ORDER BY data_atualizacao DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversas (cliente_id, status, ia_ativa)
    VALUES (v_customer_id, 'aberta', false)
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN QUERY SELECT v_customer_id, v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_evolution_payment_proof_identity_destination(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_evolution_payment_proof_identity_destination(text, text) TO service_role;

COMMENT ON FUNCTION public.resolve_evolution_payment_proof_identity_destination(text, text) IS
  'Authoritative canonical Evolution payment-proof intake destination; transaction advisory locking serializes same-phone customer and open conversation resolution.';
