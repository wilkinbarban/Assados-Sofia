-- Evolution canonical identity creation and proof admission must share one transaction:
-- an admission conflict cannot leave customer, conversation, or inbound evidence behind.
CREATE FUNCTION public.admit_and_enqueue_evolution_payment_proof(
  p_phone text,
  p_display_name text,
  p_delivery_key text,
  p_storage_key text,
  p_size_bytes bigint,
  p_mime_type text,
  p_order_id uuid,
  p_sha256 text
)
RETURNS TABLE(
  proof_id uuid,
  status text,
  idempotent boolean,
  canonical_proof_id uuid,
  duplicate boolean,
  customer_id uuid,
  conversation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_identity record;
  v_admission record;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
  END IF;

  SELECT * INTO v_identity
  FROM public.resolve_evolution_payment_proof_identity_destination(p_phone, p_display_name);

  SELECT * INTO v_admission
  FROM public.admit_and_enqueue_payment_proof(
    'whatsapp',
    p_delivery_key,
    v_identity.customer_id,
    p_phone,
    p_storage_key,
    p_size_bytes,
    p_mime_type,
    p_order_id,
    v_identity.conversation_id,
    p_sha256
  );

  RETURN QUERY SELECT
    v_admission.proof_id,
    v_admission.status,
    v_admission.idempotent,
    v_admission.canonical_proof_id,
    v_admission.duplicate,
    v_identity.customer_id,
    v_identity.conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_and_enqueue_evolution_payment_proof(text, text, text, text, bigint, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_and_enqueue_evolution_payment_proof(text, text, text, text, bigint, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.admit_and_enqueue_evolution_payment_proof(text, text, text, text, bigint, text, uuid, text) IS
  'Service-role-only atomic Evolution identity resolution and canonical payment-proof admission.';
