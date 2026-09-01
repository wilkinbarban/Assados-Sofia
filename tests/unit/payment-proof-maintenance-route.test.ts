import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), config: vi.fn(), dispatch: vi.fn(), process: vi.fn(), gates: { processing: { effective: true }, cleanup: { effective: true } } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/config/sistema', () => ({ obterConfiguracaoSistema: mocks.config }))
vi.mock('@/lib/payment-proofs/outbox-dispatch', () => ({ dispatchPaymentProofOutbox: mocks.dispatch }))
vi.mock('@/lib/payment-proofs/processing-worker', () => ({ processPaymentProofJob: mocks.process }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: mocks.gates }))
import { POST } from '@/app/api/internal/payment-proofs/maintenance/route'

const request = () => new Request('http://local/internal', { method: 'POST', headers: { authorization: 'Bearer maintenance-secret' } })

function client(claims: unknown[], options: { removeError?: unknown; completeError?: unknown } = {}) {
  let claim = 0
  const rpc = vi.fn(async (name: string) => {
    if (name === 'begin_payment_proof_maintenance') return { data: true, error: null }
    if (name === 'claim_payment_proof_maintenance') return { data: claims[claim++] ?? null, error: null }
    if (name === 'complete_payment_proof_maintenance') return { data: !options.completeError, error: options.completeError ?? null }
    if (name === 'finish_payment_proof_maintenance') return { data: true, error: null }
    return { data: true, error: null }
  })
  const remove = vi.fn().mockResolvedValue({ error: options.removeError ?? null })
  return { db: { rpc, storage: { from: vi.fn(() => ({ remove })) } }, rpc, remove }
}

describe('payment-proof maintenance route', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.gates.processing.effective = true; mocks.gates.cleanup.effective = true; mocks.config.mockImplementation(async (key:string) => key==='PAYMENT_PROOF_MAINTENANCE_SECRET'?'maintenance-secret':'worker-config');mocks.process.mockResolvedValue({ok:true}) })

  it('does not claim or execute a closed processing capability even when DB configuration is open', async () => {
    mocks.gates.processing.effective = false
    const { db, rpc } = client([{ kind: 'processing', id: 'proof-1' }])
    mocks.createAdminClient.mockReturnValue(db)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.process).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('claim_payment_proof_maintenance', expect.objectContaining({ p_kind: 'processing' }))
  })

  it.each([
    ['processing', 'process'],
    ['purge', 'purge'],
  ])('does not execute or complete a mismatched closed %s claim', async (kind, capability) => {
    mocks.gates.processing.effective = false
    mocks.gates.cleanup.effective = false
    const { db, rpc, remove } = client([{ kind, id: 'forbidden-1', original_key: 'a' }])
    mocks.createAdminClient.mockReturnValue(db)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.process).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('complete_payment_proof_maintenance', expect.anything())
    expect(capability).toBeTruthy()
  })

  it('does not create a client or call RPCs when unauthorized', async () => {
    const response = await POST(new Request('http://local/internal', { method: 'POST' }))
    expect(response.status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('returns a sanitized 503 without starting work when client construction fails', async () => {
    mocks.createAdminClient.mockImplementationOnce(() => { throw new Error('private client construction detail') })

    const response = await POST(request())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ error: 'maintenance_unavailable' })
    expect(body).not.toContain('private client construction detail')
    expect(mocks.createAdminClient).toHaveBeenCalledOnce()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'purge', id: 'p1', original_key: null, preview_key: null }, 0],
    [{ kind: 'purge', id: 'p1', original_key: 'a', preview_key: 'b' }, 2],
  ])('begins/finishes a healthy purge and counts only aggregates', async (job, keyCount) => {
    const { db, rpc, remove } = client([job])
    mocks.createAdminClient.mockReturnValue(db)
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ completed: 1, failed: 0 })
    expect(rpc.mock.calls[0][0]).toBe('begin_payment_proof_maintenance')
    expect(rpc).toHaveBeenCalledWith('complete_payment_proof_maintenance', { p_kind: 'purge', p_id: 'p1', p_success: true, p_error: null, p_lease_token: null, p_attempt: null })
    expect(rpc.mock.calls.at(-1)).toEqual(['finish_payment_proof_maintenance', { p_success: true }])
    if (keyCount) expect(remove).toHaveBeenCalledWith(['a', 'b']); else expect(remove).not.toHaveBeenCalled()
  })

  it('processes a durable proof job and completes its exact transition', async () => {
    const { db, rpc } = client([{ kind:'processing',id:'proof-1',attempt:1,lease_token:'lease-b' }])
    mocks.createAdminClient.mockReturnValue(db)
    const response=await POST(request())
    expect(await response.json()).toEqual({completed:1,failed:0})
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({proofId:'proof-1',db}))
    expect(rpc).toHaveBeenCalledWith('complete_payment_proof_maintenance',{p_kind:'processing',p_id:'proof-1',p_success:true,p_error:null,p_lease_token:'lease-b',p_attempt:1})
  })

  it('completes an unexpected processing exception with a fixed non-null stage', async () => {
    const { db, rpc } = client([{ kind:'processing',id:'proof-1',attempt:5,lease_token:'lease-e' }])
    mocks.createAdminClient.mockReturnValue(db)
    mocks.process.mockRejectedValueOnce(new Error('private worker detail'))

    const response = await POST(request())

    expect(await response.json()).toEqual({ completed:0, failed:1 })
    expect(rpc).toHaveBeenCalledWith('complete_payment_proof_maintenance', {
      p_kind:'processing', p_id:'proof-1', p_success:false, p_error:'load',
      p_lease_token:'lease-e', p_attempt:5,
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('private worker detail')
  })

  it('durably transitions storage failure without leaking details while the run remains healthy', async () => {
    const { db, rpc } = client([{ kind: 'purge', id: 'p1', original_key: 'a', preview_key: null }], { removeError: { message: 'private path' } })
    mocks.createAdminClient.mockReturnValue(db)
    const response = await POST(request())
    expect(await response.json()).toEqual({ completed: 0, failed: 1 })
    expect(rpc).toHaveBeenCalledWith('complete_payment_proof_maintenance', { p_kind: 'purge', p_id: 'p1', p_success: false, p_error: 'operation_failed', p_lease_token: null, p_attempt: null })
    expect(rpc).toHaveBeenCalledWith('finish_payment_proof_maintenance', { p_success: true })
  })

  it.each(['claim', 'completion'])('returns generic 503 and marks health failed on %s infrastructure failure', async (failure) => {
    const { db, rpc } = client(failure === 'claim' ? [] : [{ kind: 'purge', id: 'p1', original_key: null, preview_key: null }], failure === 'completion' ? { completeError: { message: 'secret' } } : {})
    if (failure === 'claim') rpc.mockImplementation(async (name: string) => name === 'claim_payment_proof_maintenance' ? { data: null, error: { message: 'secret' } } : { data: true, error: null })
    mocks.createAdminClient.mockReturnValue(db)
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'maintenance_unavailable' })
    expect(rpc).toHaveBeenCalledWith('finish_payment_proof_maintenance', { p_success: false })
  })
})
