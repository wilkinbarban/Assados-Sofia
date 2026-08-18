import { describe, expect, it, vi } from 'vitest'
import {
  isWhatsAppInboundEligibleForSofia,
  resolveWhatsAppInboundConversation,
} from '@/lib/whatsapp/sofia-control'

const stateRow = {
  id: 'state-1',
  cliente_id: 'client-1',
  canal: 'whatsapp' as const,
  sofia_dormindo: true,
  motivo: 'handoff_phrase' as const,
  origem: 'meta_webhook' as const,
  alterado_por: null,
  data_criacao: '2026-07-20T00:00:00.000Z',
  data_atualizacao: '2026-07-20T00:00:00.000Z',
}

function inboundSupabase() {
  const stateUpsert = vi.fn().mockReturnValue({
    select: () => ({ single: vi.fn().mockResolvedValue({ data: stateRow, error: null }) }),
  })

  return {
    stateUpsert,
    client: {
      from: (table: string) => {
        if (table === 'whatsapp_sofia_states') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }),
            upsert: stateUpsert,
          }
        }

        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({ limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'human-1', ia_ativa: false }, error: null }) }) }),
              }),
            }),
          }),
        }
      },
    },
  }
}

function sleepingInboundSupabase() {
  return {
    from: (table: string) => {
      if (table === 'whatsapp_sofia_states') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: stateRow, error: null }) }) }) }),
        }
      }

      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({ limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'human-1', ia_ativa: false }, error: null }) }) }),
            }),
          }),
        }),
      }
    },
  }
}

describe('WhatsApp Sofia inbound control', () => {
  it.each(['meta_webhook', 'evolution_webhook'] as const)('sleeps Sofia and routes a handoff phrase to a human conversation from %s', async (source) => {
    const { client, stateUpsert } = inboundSupabase()

    const result = await resolveWhatsAppInboundConversation({
      supabase: client as unknown as import('@supabase/supabase-js').SupabaseClient,
      clienteId: 'client-1',
      inboundText: 'Quero falar com um atendente',
      source,
    })

    expect(result).toMatchObject({ conversaId: 'human-1', iaAtiva: false, sleeping: true, handoffTriggered: true })
    expect(stateUpsert).toHaveBeenCalledWith(expect.objectContaining({
      sofia_dormindo: true,
      motivo: 'handoff_phrase',
      origem: source,
    }), { onConflict: 'cliente_id,canal' })
  })

  it('suppresses Sofia when durable sleep is active even if the conversation is IA-active', async () => {
    const stateClient = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: stateRow, error: null }) }) }) }),
      }),
    }

    const result = await isWhatsAppInboundEligibleForSofia({
      supabase: stateClient as unknown as import('@supabase/supabase-js').SupabaseClient,
      clienteId: 'client-1',
      iaAtiva: true,
    })

    expect(result).toMatchObject({ eligible: false, sleeping: true, iaAtiva: true })
  })

  it.each(['meta_webhook', 'evolution_webhook'] as const)('routes non-handoff inbound traffic from %s to a human while Sofia is sleeping', async (source) => {
    const result = await resolveWhatsAppInboundConversation({
      supabase: sleepingInboundSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient,
      clienteId: 'client-1',
      inboundText: 'Quero ver o cardapio',
      source,
    })

    expect(result).toMatchObject({ conversaId: 'human-1', iaAtiva: false, sleeping: true, handoffTriggered: false })
  })
})
