import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getWhatsAppSofiaState: vi.fn(),
  revalidatePath: vi.fn(),
  setWhatsAppSofiaSleep: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/whatsapp/sofia-control', () => ({
  getWhatsAppSofiaState: mocks.getWhatsAppSofiaState,
  setWhatsAppSofiaSleep: mocks.setWhatsAppSofiaSleep,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { alternarSofiaWhatsApp } from '@/app/actions/atendimento'

const conversationUpdates: Array<Record<string, unknown>> = []
const stateUpserts: Array<Record<string, unknown>> = []
const auditInserts: Array<Record<string, unknown>> = []

function sessionClient() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'operator-1' } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { funcao: 'admin', ativo: true }, error: null }) }) }),
    }),
  }
}

function adminClient({
  auditError,
  conversationUpdateError = null,
}: {
  auditError: { message: string } | null
  conversationUpdateError?: { message: string } | null
}) {
  let conversationUpdateCount = 0

  return {
    from: (table: string) => {
      if (table === 'conversas') {
        return {
          select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({
            data: { id: 'conversation-1', cliente_id: 'client-1', status: 'ia_atendendo', ia_ativa: true },
            error: null,
          }) }) }),
          update: (payload: Record<string, unknown>) => {
            conversationUpdates.push(payload)
            const error = conversationUpdateCount === 0 ? conversationUpdateError : null
            conversationUpdateCount += 1
            return { eq: vi.fn().mockResolvedValue({ error }) }
          },
        }
      }

      if (table === 'logs_auditoria') {
        return {
          insert: (payload: Record<string, unknown>) => {
            auditInserts.push(payload)
            return Promise.resolve({ error: auditError })
          },
        }
      }

      return {
        delete: () => ({ eq: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
        upsert: (payload: Record<string, unknown>) => {
          stateUpserts.push(payload)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  conversationUpdates.length = 0
  stateUpserts.length = 0
  auditInserts.length = 0
  mocks.createClient.mockResolvedValue(sessionClient())
  mocks.getWhatsAppSofiaState.mockResolvedValue({
    sleeping: false,
    reason: 'manual',
    source: 'operator',
    actorUserId: 'operator-0',
  })
  mocks.setWhatsAppSofiaSleep.mockResolvedValue({ sleeping: true })
})

describe('alternarSofiaWhatsApp', () => {
  it('restores sleep and conversation state when mandatory audit insertion fails', async () => {
    mocks.createAdminClient.mockReturnValue(adminClient({ auditError: { message: 'audit unavailable' } }))

    const result = await alternarSofiaWhatsApp('client-1', true, 'conversation-1')

    expect(result).toEqual({ success: false, error: 'ERRO_AUDITORIA_OBRIGATORIA: audit unavailable' })
    expect(mocks.setWhatsAppSofiaSleep).toHaveBeenCalledWith(expect.objectContaining({ sleeping: true }))
    expect(conversationUpdates).toEqual([
      expect.objectContaining({ ia_ativa: false, status: 'aberta' }),
      expect.objectContaining({ ia_ativa: true, status: 'ia_atendendo' }),
    ])
    expect(stateUpserts).toEqual([expect.objectContaining({ sofia_dormindo: false, origem: 'operator' })])
  })

  it('wakes Sofia without mutating the conversation when the audit succeeds', async () => {
    mocks.createAdminClient.mockReturnValue(adminClient({ auditError: null }))
    mocks.setWhatsAppSofiaSleep.mockResolvedValue({ sleeping: false })

    const result = await alternarSofiaWhatsApp('client-1', false, 'conversation-1')

    expect(result).toEqual({ success: true, state: { sleeping: false } })
    expect(mocks.setWhatsAppSofiaSleep).toHaveBeenCalledWith(expect.objectContaining({ sleeping: false }))
    expect(conversationUpdates).toEqual([])
    expect(auditInserts).toEqual([expect.objectContaining({
      usuario_id: 'operator-1',
      acao: 'sofia_whatsapp_acordar',
    })])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/atendimento')
  })

  it('restores the durable sleep state and skips revalidation when conversation sleep update fails', async () => {
    mocks.createAdminClient.mockReturnValue(adminClient({
      auditError: null,
      conversationUpdateError: { message: 'conversation unavailable' },
    }))

    const result = await alternarSofiaWhatsApp('client-1', true, 'conversation-1')

    expect(result).toEqual({ success: false, error: 'ERRO_ATUALIZACAO_CONVERSA: conversation unavailable' })
    expect(stateUpserts).toEqual([expect.objectContaining({ sofia_dormindo: false, origem: 'operator' })])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
