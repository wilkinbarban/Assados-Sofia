import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: vi.fn().mockImplementation(() => ({
        authorize: vi.fn(),
      })),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        insert: vi.fn(),
      },
    }),
  },
}))

function makeOperatorClient(role = 'admin') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'operator-123' } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'perfis') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { funcao: role, ativo: true },
            error: null,
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'comp-1',
              cliente_id: 'client-123',
              url_arquivo: 'receipts/comp-1.pdf',
              nome_arquivo: 'receipt-1.pdf',
              tamanho_bytes: 1024,
              data_criacao: '2026-07-11T12:00:00Z',
              clientes: { nome: 'Ana Silva' }
            }
          ],
          error: null,
        }),
      }
    }),
  }
}

describe('obterComprovantes Server Action (Task 2.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthorized access if not operator', async () => {
    mocks.createClient.mockResolvedValue(makeOperatorClient('cliente'))
    const { obterComprovantes } = await import('@/app/actions/admin')

    const result = await obterComprovantes({})
    expect(result.success).toBe(false)
    expect(result.error).toContain('ACESSO_NEGADO')
  })

  it('fetches all comprovantes for authorized operators', async () => {
    const client = makeOperatorClient('admin')
    mocks.createClient.mockResolvedValue(client)
    const { obterComprovantes } = await import('@/app/actions/admin')

    const result = await obterComprovantes({})
    expect(result.data).toBeDefined()
    expect(result.data?.[0]?.clientes?.nome).toBe('Ana Silva')
  })

  it('applies client filter and date range filters correctly', async () => {
    const client = makeOperatorClient('supervisor')
    mocks.createClient.mockResolvedValue(client)
    const { obterComprovantes } = await import('@/app/actions/admin')

    const fromSpy = vi.spyOn(client, 'from')

    const filters = {
      clienteId: 'client-123',
      dataInicio: '2026-07-10T00:00:00Z',
      dataFim: '2026-07-12T00:00:00Z',
    }

    const result = await obterComprovantes(filters)
    expect(result.success).toBe(true)
    expect(fromSpy).toHaveBeenCalledWith('comprovantes')
  })
})
