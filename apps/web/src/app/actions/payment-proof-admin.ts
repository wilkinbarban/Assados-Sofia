'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { paymentProofOperationalGates } from '@/lib/payment-proofs/operational-gates'
import { notificarClienteAtualizacaoPedido } from '@/lib/orders/orderNotifications'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const leaseToken = /^[0-9a-f]{64}$/i
const safeErrors = new Set([
  'FORBIDDEN', 'INVALID_PROOF', 'INVALID_ORDERS', 'INVALID_AMOUNT', 'INVALID_LEASE',
  'PAYMENT_PROOF_LEASE_CONFLICT', 'PAYMENT_PROOF_LEASE_EXPIRED', 'PAYMENT_PROOF_LEASE_NOT_OWNED',
  'PAYMENT_PROOF_AMOUNT_CONFLICT', 'PAYMENT_PROOF_AMOUNT_REQUIRED', 'PAYMENT_PROOF_AMOUNT_MISMATCH',
  'PAYMENT_PROOF_CONFIRMATION_INVALID_STATE', 'PAYMENT_PROOF_REJECTION_INVALID_STATE',
  'PAYMENT_PROOF_NOT_RECONCILABLE', 'PAYMENT_PROOF_ALREADY_RECONCILED',
  'PAYMENT_PROOF_RECONCILIATION_CONFLICT', 'PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH',
  'PAYMENT_PROOF_ORDER_INELIGIBLE', 'PAYMENT_PROOF_REQUESTED_ORDER_REQUIRED', 'PAYMENT_PROOF_DUPLICATE_ORDER',
])
const MAX_ORDER_IDS = 100
const MAX_CENTS = 999_999_999_999
const canonicalCents = /^[1-9]\d{0,11}$/

function validCents(value: unknown): value is number | string {
  return typeof value === 'number'
    ? Number.isSafeInteger(value) && value > 0 && value <= MAX_CENTS
    : typeof value === 'string' && canonicalCents.test(value) && Number(value) <= MAX_CENTS
}

type Actor = { session: Awaited<ReturnType<typeof createClient>>; role: 'admin' | 'supervisor' | 'vendedor' }
type Operation = 'acquire' | 'release' | 'confirm_amount' | 'reject' | 'restore' | 'reconcile'
type MutationInput = { operation: Operation; proofId: string; value?: string | number; orderIds?: string[]; leaseToken?: string }
type MutationResult = { success: true; proof?: { status: string; purge_after: string | null }; lease?: { token: string; expiresAt: string } } | { success: false; error: string }
type Diagnostics = { processing_queue_dead_letter: number; outbox_dead_letter: number; unresolved_dead_letter: number; oldest_unresolved_dead_letter_at: string | null; oldest_unresolved_dead_letter_age_seconds: number | null }
type ReplayInput = { source: 'processing_queue' | 'outbox'; targetId: string; idempotencyKey: string }
type ReplayOutcome = 'replayed' | 'ineligible' | 'idempotency_conflict' | 'invalid_request'
type GateDiagnostics = { canonicalIngest: { effective: boolean; reason: string }; whatsappIngest: { effective: boolean; reason: string }; telegramIngest: { effective: boolean; reason: string }; processing: { effective: boolean; reason: string }; sellerReconciliation: { effective: boolean; reason: string }; privilegedReplay: { effective: boolean; reason: string }; cleanup: { effective: boolean; reason: string }; restore: { effective: boolean; reason: string } }

async function staff(): Promise<Actor | null> {
  const session = await createClient()
  const { data: { user }, error } = await session.auth.getUser()
  if (error || !user) return null
  const { data: profile, error: profileError } = await session.from('perfis').select('funcao,ativo').eq('id', user.id).single()
  if (profileError || !profile?.ativo || !['admin', 'supervisor', 'vendedor'].includes(profile.funcao)) return null
  return { session, role: profile.funcao as Actor['role'] }
}

async function privilegedStaff(): Promise<Actor | null> {
  const actor = await staff()
  return actor && (actor.role === 'admin' || actor.role === 'supervisor') ? actor : null
}

function safeError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  return safeErrors.has(message) ? message : 'PAYMENT_PROOF_OPERATION_UNAVAILABLE'
}

function diagnostics(value: unknown): Diagnostics | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const processing = data.processing_queue_dead_letter
  const outbox = data.outbox_dead_letter
  const unresolved = data.unresolved_dead_letter
  const oldestAt = data.oldest_unresolved_dead_letter_at
  const oldestAge = data.oldest_unresolved_dead_letter_age_seconds
  const count = (candidate: unknown): candidate is number => typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0
  if (!count(processing) || !count(outbox) || !count(unresolved) || !(oldestAt === null || typeof oldestAt === 'string') || !(oldestAge === null || count(oldestAge))) return null
  return { processing_queue_dead_letter: processing, outbox_dead_letter: outbox, unresolved_dead_letter: unresolved, oldest_unresolved_dead_letter_at: oldestAt, oldest_unresolved_dead_letter_age_seconds: oldestAge }
}

export async function getPaymentProofOperationalGatesDiagnostics() {
  const actor = await privilegedStaff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  const gates = paymentProofOperationalGates
  const data: GateDiagnostics = {
    canonicalIngest: { effective: gates.canonicalIngest.effective, reason: gates.canonicalIngest.reason },
    whatsappIngest: { effective: gates.whatsappIngest.effective, reason: gates.whatsappIngest.reason },
    telegramIngest: { effective: gates.telegramIngest.effective, reason: gates.telegramIngest.reason },
    processing: { effective: gates.processing.effective, reason: gates.processing.reason },
    sellerReconciliation: { effective: gates.sellerReconciliation.effective, reason: gates.sellerReconciliation.reason },
    privilegedReplay: { effective: gates.privilegedReplay.effective, reason: gates.privilegedReplay.reason },
    cleanup: { effective: gates.cleanup.effective, reason: gates.cleanup.reason },
    restore: { effective: gates.restore.effective, reason: gates.restore.reason },
  }
  return { success: true as const, data }
}

export async function getPaymentProofUnresolvedDiagnostics() {
  const actor = await privilegedStaff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  const { data, error } = await actor.session.rpc('get_payment_proof_unresolved_diagnostics')
  const safe = diagnostics(data)
  return error || !safe ? { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' } : { success: true as const, data: safe }
}

export async function replayPaymentProofDeadLetter(input: unknown) {
  if (!input || typeof input !== 'object') return { success: false as const, error: 'INVALID_REQUEST' }
  if (!paymentProofOperationalGates.privilegedReplay.effective) return { success: false as const, error: 'FORBIDDEN' }
  const { source, targetId, idempotencyKey } = input as Partial<ReplayInput>
  if ((source !== 'processing_queue' && source !== 'outbox') || typeof targetId !== 'string' || !targetId.trim() || !uuid.test(idempotencyKey || '') || (source === 'processing_queue' ? !uuid.test(targetId) : !/^[1-9]\d*$/.test(targetId))) return { success: false as const, error: 'INVALID_REQUEST' }
  const actor = await privilegedStaff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  const { data, error } = await actor.session.rpc('replay_payment_proof_dead_letter', { p_source: source, p_target_id: targetId, p_idempotency_key: idempotencyKey })
  const outcome = data && typeof data === 'object' ? (data as { outcome?: unknown }).outcome : null
  return error || !['replayed', 'ineligible', 'idempotency_conflict', 'invalid_request'].includes(outcome as string) ? { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' } : { success: true as const, outcome: outcome as ReplayOutcome }
}

export async function listPaymentProofsForAdmin() {
  const actor = await privilegedStaff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  const { data, error } = await actor.session
    .from('payment_proofs')
    .select('id,customer_id,channel,status,suggested_cents,confirmed_cents,extraction_confidence,purge_after,created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }

  const customerIds = Array.from(
    new Set((data || []).map((p) => p.customer_id).filter((id): id is string => !!id && uuid.test(id)))
  )

  let customerMap = new Map<string, { nome: string; telefone: string | null }>()
  if (customerIds.length > 0) {
    try {
      const { data: clientes } = await actor.session
        .from('clientes')
        .select('id, nome, telefone')
        .in('id', customerIds)
      if (clientes) {
        customerMap = new Map(clientes.map((c) => [c.id, { nome: c.nome, telefone: c.telefone }]))
      }
    } catch {
      // Ignora falha caso a tabela clientes esteja temporariamente inacessível
    }
  }

  return { success: true as const, role: actor.role, data: (data || []).map((proof) => {
    const cust = proof.customer_id ? customerMap.get(proof.customer_id) : null
    return {
      ...proof,
      customer_name: cust?.nome || (proof.customer_id ? `Cliente …${proof.customer_id.slice(-4)}` : null),
      customer_phone: cust?.telefone || null,
      suggested_cents: proof.suggested_cents ?? proof.confirmed_cents ?? null,
      extraction_confidence: proof.extraction_confidence ?? null,
      preview_url: `/api/payment-proofs/${proof.id}/preview`,
      original_url: `/api/payment-proofs/${proof.id}/original`,
    }
  }) }
}

export async function listEligiblePaymentProofOrders(customerId: string) {
  const actor = await privilegedStaff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  if (!uuid.test(customerId)) return { success: false as const, error: 'INVALID_CUSTOMER' }
  const { data, error } = await actor.session.from('pedidos').select('id,cliente_id,total_pedido_centavos,status,status_pagamento').eq('cliente_id', customerId).eq('status_pagamento', 'pendente').neq('status', 'cancelado').order('data_criacao', { ascending: false }).limit(100)
  if (error) return { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }
  return { success: true as const, data: (data || []).map((order) => ({ ...order, customer_id: order.cliente_id })) }
}

export async function mutatePaymentProofAdmin(input: MutationInput): Promise<MutationResult> {
  if (!input || !uuid.test(input.proofId)) return { success: false, error: 'INVALID_PROOF' }
  const financialMutation = input.operation === 'confirm_amount' || input.operation === 'reconcile' || input.operation === 'reject'
  const actor = financialMutation ? await privilegedStaff() : await staff()
  if (!actor) return { success: false, error: 'FORBIDDEN' }
  if (input.operation === 'restore' && (!paymentProofOperationalGates.restore.effective || actor.role !== 'admin')) return { success: false, error: 'FORBIDDEN' }

  if ((input.operation === 'confirm_amount' || input.operation === 'reconcile') && paymentProofOperationalGates.sellerReconciliation?.effective === false) return { success: false, error: 'FORBIDDEN' }

  if (input.operation === 'acquire') {
    const { data, error } = await actor.session.rpc('acquire_payment_proof_lease', { p_proof_id: input.proofId })
    const lease = Array.isArray(data) ? data[0] : data
    if (error || !lease || typeof lease !== 'object' || !('lease_token' in lease) || !('expires_at' in lease) || typeof lease.lease_token !== 'string' || typeof lease.expires_at !== 'string') return { success: false, error: safeError(error) }
    return { success: true, lease: { token: lease.lease_token, expiresAt: lease.expires_at } }
  }
  if (input.operation === 'restore') {
    const { error } = await actor.session.rpc('restore_payment_proof', { p_proof_id: input.proofId, p_reason: 'operator workflow' })
    if (error) return { success: false, error: safeError(error) }
    const { data: proof, error: proofError } = await actor.session.from('payment_proofs').select('status,purge_after').eq('id', input.proofId).single()
    if (proofError || !proof) return { success: false, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }
    revalidatePath('/atendimento/admin'); return { success: true, proof }
  }
  if (!input.leaseToken || !leaseToken.test(input.leaseToken)) return { success: false, error: 'INVALID_LEASE' }
  if (input.operation === 'release') {
    const { error } = await actor.session.rpc('release_payment_proof_lease', { p_proof_id: input.proofId, p_lease_token: input.leaseToken })
    return error ? { success: false, error: safeError(error) } : { success: true }
  }

  let rpc: string; let args: Record<string, unknown>
  if (input.operation === 'confirm_amount') {
    if (!validCents(input.value)) return { success: false, error: 'INVALID_AMOUNT' }
    const cents = Number(input.value)
    rpc = 'confirm_payment_proof_amount'; args = { p_proof_id: input.proofId, p_confirmed_cents: cents, p_lease_token: input.leaseToken }
  } else if (input.operation === 'reconcile') {
    const orderIds = input.orderIds
    if (!Array.isArray(orderIds) || !orderIds.length || orderIds.length > MAX_ORDER_IDS || orderIds.some((id) => typeof id !== 'string' || !uuid.test(id)) || new Set(orderIds).size !== orderIds.length) return { success: false, error: 'INVALID_ORDERS' }
    rpc = 'reconcile_payment_proof'; args = { p_proof_id: input.proofId, p_order_ids: orderIds, p_idempotency_key: crypto.randomUUID(), p_lease_token: input.leaseToken }
  } else if (input.operation === 'reject') {
    rpc = 'manage_payment_proof_review'; args = { p_proof_id: input.proofId, p_operation: 'reject', p_value: null, p_lease_token: input.leaseToken }
  } else {
    return { success: false, error: 'FORBIDDEN' }
  }
  const { error } = await actor.session.rpc(rpc, args)
  if (error) return { success: false, error: safeError(error) }
  const { data: proof, error: proofError } = await actor.session.from('payment_proofs').select('status,purge_after').eq('id', input.proofId).single()
  if (proofError || !proof) return { success: false, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }

  if (input.operation === 'reconcile' && input.orderIds) {
    for (const orderId of input.orderIds) {
      try {
        await notificarClienteAtualizacaoPedido({
          pedidoId: orderId,
          tipo: 'status_pagamento',
          statusPagamento: 'aprovado',
          supabaseClient: actor.session,
        })
      } catch {}
    }
  }

  revalidatePath('/atendimento/admin'); revalidatePath('/atendimento')
  return { success: true, proof }
}

export async function getPaymentProofForPreviewModal(proofId: string) {
  if (!uuid.test(proofId)) return { success: false as const, error: 'INVALID_REQUEST' }
  const actor = await privilegedStaff()
  if (!actor) return { success: false as const, error: 'FORBIDDEN' }

  const { data: proof, error: proofError } = await actor.session
    .from('payment_proofs')
    .select('id, customer_id, channel, status, suggested_cents, confirmed_cents, extraction_confidence, created_at')
    .eq('id', proofId)
    .single()

  if (proofError || !proof) return { success: false as const, error: 'PROOF_NOT_FOUND' }

  // Search in payment_proof_order_intents
  const { data: intent } = await actor.session
    .from('payment_proof_order_intents')
    .select('pedido_id')
    .eq('proof_id', proofId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let orderId = intent?.pedido_id || null

  // If no intent, look up latest pending order of customer
  if (!orderId && proof.customer_id) {
    const { data: latestOrder } = await actor.session
      .from('pedidos')
      .select('id')
      .eq('cliente_id', proof.customer_id)
      .eq('status_pagamento', 'pendente')
      .neq('status', 'cancelado')
      .order('data_criacao', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestOrder) orderId = latestOrder.id
  }

  let orderData = null
  if (orderId) {
    const { data: order } = await actor.session
      .from('pedidos')
      .select('id, total_pedido_centavos, status, status_pagamento, data_criacao')
      .eq('id', orderId)
      .single()
    if (order) orderData = order
  }

  return {
    success: true as const,
    data: {
      proof: {
        id: proof.id,
        status: proof.status,
        channel: proof.channel,
        suggested_cents: proof.suggested_cents,
        confirmed_cents: proof.confirmed_cents,
        extraction_confidence: proof.extraction_confidence,
        preview_url: `/api/payment-proofs/${proof.id}/preview`,
        original_url: `/api/payment-proofs/${proof.id}/original`,
      },
      order: orderData,
    },
  }
}

export async function approvePaymentProofDirectly(proofId: string, orderId: string, cents?: number) {
  if (!uuid.test(proofId) || !uuid.test(orderId)) return { success: false as const, error: 'INVALID_REQUEST' }
  const actor = await privilegedStaff()
  if (!actor || !paymentProofOperationalGates.sellerReconciliation.effective) return { success: false as const, error: 'FORBIDDEN' }

  // Verificação de idempotência: somente uma conciliação persistida ou o pedido
  // já pago prova que esta associação foi efetivamente concluída.
  const { data: existingLink } = await actor.session
    .from('payment_proof_order_links')
    .select('proof_id,pedido_id')
    .eq('proof_id', proofId)
    .eq('pedido_id', orderId)
    .maybeSingle()

  const { data: currentOrder } = await actor.session
    .from('pedidos')
    .select('status_pagamento')
    .eq('id', orderId)
    .single()

  if (existingLink && currentOrder?.status_pagamento === 'aprovado') {
    return { success: true as const, alreadyReconciled: true }
  }

  // 1. Acquire lease
  const { data: leaseData, error: leaseErr } = await actor.session.rpc('acquire_payment_proof_lease', { p_proof_id: proofId })
  const lease = Array.isArray(leaseData) ? leaseData[0] : leaseData
  if (leaseErr || !lease?.lease_token) return { success: false as const, error: safeError(leaseErr) }
  const token = lease.lease_token

  try {
    // 2. Fetch current proof status and order amount
    const { data: proof } = await actor.session.from('payment_proofs').select('status, confirmed_cents, suggested_cents').eq('id', proofId).single()
    const { data: order } = await actor.session.from('pedidos').select('total_pedido_centavos').eq('id', orderId).single()

    const targetCents = cents ?? proof?.confirmed_cents ?? proof?.suggested_cents ?? order?.total_pedido_centavos
    if (!targetCents || !validCents(targetCents)) {
      await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })
      return { success: false as const, error: 'INVALID_AMOUNT' }
    }

    // 3. Confirm amount if in review
    if (proof?.status === 'review' || !proof?.confirmed_cents) {
      const { error: confErr } = await actor.session.rpc('confirm_payment_proof_amount', {
        p_proof_id: proofId,
        p_confirmed_cents: Number(targetCents),
        p_lease_token: token,
      })
      if (confErr) {
        await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })
        return { success: false as const, error: safeError(confErr) }
      }
    }

    // 4. Reconcile with the order
    const { error: recErr } = await actor.session.rpc('reconcile_payment_proof', {
      p_proof_id: proofId,
      p_order_ids: [orderId],
      p_idempotency_key: crypto.randomUUID(),
      p_lease_token: token,
    })
    if (recErr) {
      await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })
      return { success: false as const, error: safeError(recErr) }
    }

    // 5. Release lease
    await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })

    // 6. Notificar cliente nos canais cadastrados (Web, WhatsApp, Telegram)
    try {
      await notificarClienteAtualizacaoPedido({
        pedidoId: orderId,
        tipo: 'status_pagamento',
        statusPagamento: 'aprovado',
        supabaseClient: actor.session,
      })
    } catch (notifErr) {
      console.warn('Falha ao notificar aprovação de comprovante:', notifErr)
    }

    revalidatePath('/atendimento')
    revalidatePath('/atendimento/pedidos')
    revalidatePath('/atendimento/admin')
    revalidatePath('/cliente/pedidos')
    return { success: true as const }
  } catch {
    try {
      await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })
    } catch {}
    return { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }
  }
}

export async function rejectPaymentProofDirectly(proofId: string) {
  if (!uuid.test(proofId)) return { success: false as const, error: 'INVALID_REQUEST' }
  const actor = await privilegedStaff()
  if (!actor) return { success: false as const, error: 'FORBIDDEN' }

  // 1. Acquire lease
  const { data: leaseData, error: leaseErr } = await actor.session.rpc('acquire_payment_proof_lease', { p_proof_id: proofId })
  const lease = Array.isArray(leaseData) ? leaseData[0] : leaseData
  if (leaseErr || !lease?.lease_token) return { success: false as const, error: safeError(leaseErr) }
  const token = lease.lease_token

  try {
    // 2. Reject
    const { error: rejErr } = await actor.session.rpc('manage_payment_proof_review', {
      p_proof_id: proofId,
      p_operation: 'reject',
      p_value: null,
      p_lease_token: token,
    })
    if (rejErr) {
      await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })
      return { success: false as const, error: safeError(rejErr) }
    }

    // 3. Release lease
    await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })

    // 4. Notificar cliente nos canais cadastrados (Web, WhatsApp, Telegram)
    try {
      const { data: intent } = await actor.session
        .from('payment_proof_order_intents')
        .select('pedido_id')
        .eq('proof_id', proofId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (intent?.pedido_id) {
        await notificarClienteAtualizacaoPedido({
          pedidoId: intent.pedido_id,
          tipo: 'status_pagamento',
          statusPagamento: 'rejeitado',
          motivo: 'Comprovante não validado ou recusado na conferência.',
          supabaseClient: actor.session,
        })
      } else {
        const { data: proof } = await actor.session
          .from('payment_proofs')
          .select('customer_id, conversation_id')
          .eq('id', proofId)
          .single()

        let conversaId = proof?.conversation_id
        if (!conversaId && proof?.customer_id) {
          const { data: conv } = await actor.session
            .from('conversas')
            .select('id')
            .eq('cliente_id', proof.customer_id)
            .order('data_atualizacao', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (conv) conversaId = conv.id
        }

        if (conversaId) {
          await actor.session.from('mensagens').insert({
            conversa_id: conversaId,
            remetente: 'operador',
            conteudo: '❌ Seu comprovante de pagamento não pôde ser validado na conferência. Por favor, verifique e envie um comprovante legível.',
            data_criacao: new Date().toISOString(),
          })
        }
      }
    } catch (notifErr) {
      console.warn('Falha ao notificar rejeição de comprovante:', notifErr)
    }

    revalidatePath('/atendimento')
    revalidatePath('/atendimento/pedidos')
    revalidatePath('/atendimento/admin')
    return { success: true as const }
  } catch {
    try {
      await actor.session.rpc('release_payment_proof_lease', { p_proof_id: proofId, p_lease_token: token })
    } catch {}
    return { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }
  }
}
