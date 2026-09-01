import { describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const single = vi.fn()
const download = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser }, from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })),
}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })),
  storage: { from: vi.fn(() => ({ download })) },
}) }))
import { GET } from '@/app/api/payment-proofs/[id]/original/route'

describe('row-authorized payment proof original', () => {
  it('denies unauthenticated and seller access before storage', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await GET(new Request('http://x'), { params: Promise.resolve({ id: '1' }) })).status).toBe(401)
    getUser.mockResolvedValueOnce({ data: { user: { id: 'u' } }, error: null })
    single.mockResolvedValueOnce({ data: { funcao: 'vendedor', ativo: true }, error: null })
    expect((await GET(new Request('http://x'), { params: Promise.resolve({ id: '1' }) })).status).toBe(403)
    expect(download).not.toHaveBeenCalled()
  })

  it('re-reads the row and downloads its private key for supervisors', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    single.mockResolvedValueOnce({ data: { funcao: 'supervisor', ativo: true }, error: null })
      .mockResolvedValueOnce({ data: { original_storage_key: 'proofs/private/a.pdf' }, error: null })
    download.mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }), error: null })
    const response = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'proof-id' }) })
    expect(response.status).toBe(200)
    expect(download).toHaveBeenCalledWith('proofs/private/a.pdf')
  })
})
