import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  obterConfiguracaoSistema: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/config/sistema', () => ({ obterConfiguracaoSistema: mocks.obterConfiguracaoSistema }))

import { GET, dynamic } from '@/app/api/internal/payment-proofs/metrics/route'
import { parsePaymentProofOperationalMetrics } from '@/lib/payment-proofs/operational-metrics'

const valid = {
  lifecycle: { received: 0, identity_pending: 0, processing: 0, review: 0, admitted: 0, quarantined: 0, purging: 0, duplicate: 0, purged: 0 },
  outbox: { pending: 0, claimed: 0, completed: 0, dead_letter: 0, attempts: { zero: 0, one: 0, two: 0, three_to_four: 0, five_plus: 0 }, dead_letter_last_60m: 0 },
  quarantine: { total: 0, expired: 0 },
  purge: { failures_last_60m: 0 },
  failures: { render_last_60m: 0, classifier_last_60m: 0 },
  maintenance: { running: false, last_started_at: null, last_finished_at: null, last_success_at: null, age_seconds: null, consecutive_failures: 0 },
}

describe('payment-proof operational metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.obterConfiguracaoSistema.mockResolvedValue('metrics-secret')
  })

  it('strictly accepts only the fixed response shape', () => {
    expect(parsePaymentProofOperationalMetrics(valid)).toEqual(valid)
    expect(() => parsePaymentProofOperationalMetrics({ ...valid, proof_id: 'forbidden' })).toThrow()
    expect(() => parsePaymentProofOperationalMetrics({ ...valid, lifecycle: { ...valid.lifecycle, received: -1 } })).toThrow()
    expect(() => parsePaymentProofOperationalMetrics({ ...valid, maintenance: { ...valid.maintenance, age_seconds: 1.5 } })).toThrow()
  })

  it('authenticates before creating the operational client', async () => {
    const response = await GET(new Request('http://local/internal'))
    expect(response.status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('is dynamic/no-store and calls exactly the aggregate RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: valid, error: null })
    mocks.createAdminClient.mockReturnValue({ rpc })
    const response = await GET(new Request('http://local/internal', { headers: { authorization: 'Bearer metrics-secret' } }))
    expect(dynamic).toBe('force-dynamic')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_payment_proof_operational_metrics')
    expect(await response.json()).toEqual(valid)
  })

  it.each([
    [{ data: null, error: { message: 'sensitive infrastructure detail' } }],
    [{ data: { ...valid, sender: 'forbidden' }, error: null }],
  ])('returns a generic 503 without reflecting failures', async (result) => {
    mocks.createAdminClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue(result) })
    const response = await GET(new Request('http://local/internal', { headers: { authorization: 'Bearer metrics-secret' } }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'metrics_unavailable' })
  })
})
