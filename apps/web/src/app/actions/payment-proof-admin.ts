'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
  const count = (key: keyof Pick<Diagnostics, 'processing_queue_dead_letter' | 'outbox_dead_letter' | 'unresolved_dead_letter'>) => typeof data[key] === 'number' && Number.isSafeInteger(data[key]) && data[key] >= 0
  const oldestAt = data.oldest_unresolved_dead_letter_at
  const oldestAge = data.oldest_unresolved_dead_letter_age_seconds
  if (!count('processing_queue_dead_letter') || !count('outbox_dead_letter') || !count('unresolved_dead_letter') || !(oldestAt === null || typeof oldestAt === 'string') || !(oldestAge === null || typeof oldestAge === 'number' && Number.isSafeInteger(oldestAge) && oldestAge >= 0)) return null
  return { processing_queue_dead_letter: data.processing_queue_dead_letter, outbox_dead_letter: data.outbox_dead_letter, unresolved_dead_letter: data.unresolved_dead_letter, oldest_unresolved_dead_letter_at: oldestAt, oldest_unresolved_dead_letter_age_seconds: oldestAge }
}

export async function getPaymentProofUnresolvedDiagnostics() {
  const actor = await privilegedStaff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  const { data, error } = await actor.session.rpc('get_payment_proof_unresolved_diagnostics')
  const safe = diagnostics(data)
  return error || !safe ? { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' } : { success: true as const, data: safe }
}

export async function replayPaymentProofDeadLetter(input: unknown) {
  if (!input || typeof input !== 'object') return { success: false as const, error: 'INVALID_REQUEST' }
  const { source, targetId, idempotencyKey } = input as Partial<ReplayInput>
  if ((source !== 'processing_queue' && source !== 'outbox') || typeof targetId !== 'string' || !targetId.trim() || !uuid.test(idempotencyKey || '') || (source === 'processing_queue' ? !uuid.test(targetId) : !/^[1-9]\d*$/.test(targetId))) return { success: false as const, error: 'INVALID_REQUEST' }
  const actor = await privilegedStaff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  const { data, error } = await actor.session.rpc('replay_payment_proof_dead_letter', { p_source: source, p_target_id: targetId, p_idempotency_key: idempotencyKey })
  const outcome = data && typeof data === 'object' ? (data as { outcome?: unknown }).outcome : null
  return error || !['replayed', 'ineligible', 'idempotency_conflict', 'invalid_request'].includes(outcome as string) ? { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' } : { success: true as const, outcome: outcome as ReplayOutcome }
}

export async function listPaymentProofsForAdmin() {
  const actor = await staff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  const { data, error } = await actor.session.from('payment_proofs').select('id,customer_id,channel,status,suggested_cents,confirmed_cents,extraction_confidence,purge_after,created_at').order('created_at', { ascending: false }).limit(200)
  if (error) return { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }
  return { success: true as const, role: actor.role, data: (data || []).map((proof) => ({
    ...proof, customer_name: proof.customer_id ? `Cliente …${proof.customer_id.slice(-4)}` : null,
    preview_url: `/api/payment-proofs/${proof.id}/preview`, original_url: `/api/payment-proofs/${proof.id}/original`,
  })) }
}

export async function listEligiblePaymentProofOrders(customerId: string) {
  const actor = await staff(); if (!actor) return { success: false as const, error: 'FORBIDDEN' }
  if (!uuid.test(customerId)) return { success: false as const, error: 'INVALID_CUSTOMER' }
  const { data, error } = await actor.session.from('pedidos').select('id,cliente_id,total_pedido_centavos,status,status_pagamento').eq('cliente_id', customerId).eq('status_pagamento', 'pendente').neq('status', 'cancelado').order('data_criacao', { ascending: false }).limit(100)
  if (error) return { success: false as const, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' }
  return { success: true as const, data: (data || []).map((order) => ({ ...order, customer_id: order.cliente_id })) }
}

export async function mutatePaymentProofAdmin(input: MutationInput): Promise<MutationResult> {
  if (!input || !uuid.test(input.proofId)) return { success: false, error: 'INVALID_PROOF' }
  const actor = await staff(); if (!actor) return { success: false, error: 'FORBIDDEN' }
  if (input.operation === 'restore' && actor.role !== 'admin') return { success: false, error: 'FORBIDDEN' }

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
  revalidatePath('/atendimento/admin'); revalidatePath('/atendimento')
  return { success: true, proof }
}
