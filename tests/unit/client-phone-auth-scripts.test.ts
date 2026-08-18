import { describe, expect, it, vi } from 'vitest'
import { auditarClientes } from '../../scripts/client-phone-auth-audit.mjs'
import { executarBackfill } from '../../scripts/client-phone-auth-backfill.mjs'
import { reconciliarDesafios } from '../../scripts/client-phone-auth-reconcile.mjs'

describe('Fase 1: Scripts de Auditoria, Backfill e Reconciliação', () => {
  describe('client-phone-auth-audit', () => {
    it('identifies valid Curitiba phones, invalid phones, duplicates, and quarantine candidates', async () => {
      const mockClientes = [
        {
          id: 'c-1',
          nome: 'Cliente Valido',
          telefone: '5541999991111',
          email: null,
          usuario_id: 'u-1',
          telegram_chat_id: null,
          telefone_verificado_em: '2026-08-16T12:00:00Z',
          telefone_verificado_origem: 'whatsapp'
        },
        {
          id: 'c-2',
          nome: 'Cliente Invalido Fixo',
          telefone: '554133334444',
          email: null,
          usuario_id: null,
          telegram_chat_id: null,
          telefone_verificado_em: null,
          telefone_verificado_origem: null
        },
        {
          id: 'c-3',
          nome: 'Cliente Duplicado 1',
          telefone: '5541988882222',
          usuario_id: 'u-3',
          telefone_verificado_em: null
        },
        {
          id: 'c-4',
          nome: 'Cliente Duplicado 2',
          telefone: '5541988882222',
          usuario_id: null,
          telefone_verificado_em: null
        }
      ]

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: mockClientes, error: null })
        })
      }

      const report = await auditarClientes(mockSupabase as any)

      expect(report.totalClientes).toBe(4)
      expect(report.telefonesValidos).toBe(3)
      expect(report.telefonesInvalidos).toBe(1)
      expect(report.telefonesDuplicados).toBe(2)
      expect(report.verificados).toBe(1)
      expect(report.naoVerificados).toBe(3)
      expect(report.orfaos).toBe(2)
      expect(report.quarentena.length).toBe(3) // 1 invalid + 2 duplicates
    })
  })

  describe('client-phone-auth-backfill', () => {
    it('backfills explicit verification timestamp for customers with legacy OTP or Telegram evidence', async () => {
      const mockClientes = [
        {
          id: 'c-1',
          telefone: '5541999991111',
          usuario_id: 'u-1',
          telegram_chat_id: '1234567',
          telefone_verificado_em: null
        },
        {
          id: 'c-2',
          telefone: '5541999992222',
          usuario_id: 'u-2',
          telegram_chat_id: null,
          telefone_verificado_em: null
        },
        {
          id: 'c-3',
          telefone: '5541999993333',
          usuario_id: null,
          telegram_chat_id: null,
          telefone_verificado_em: null
        }
      ]

      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'clientes') {
            return {
              select: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({ data: mockClientes, error: null })
                })
              }),
              update: updateMock
            }
          }
          if (table === 'codigos_verificacao') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: any) => {
                  return {
                    eq: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({
                          data: val === '5541999992222' ? [{ id: 'otp-1', data_criacao: '2026-08-10T10:00:00Z' }] : []
                        })
                      })
                    })
                  }
                })
              })
            }
          }
          return {}
        })
      }

      const res = await executarBackfill(mockSupabase as any)

      expect(res.atualizados).toBe(2) // c-1 (telegram) + c-2 (otp)
      expect(res.ignorados).toBe(1)  // c-3 (sem evidencias)
    })
  })

  describe('client-phone-auth-reconcile', () => {
    it('expires stale challenges older than expiry time', async () => {
      const mockPendentes = [
        { id: 'd-1', telefone: '5541999991111', status: 'pending_delivery', expira_em: '2026-08-16T10:00:00Z' },
        { id: 'd-2', telefone: '5541999992222', status: 'active', expira_em: '2026-08-16T11:00:00Z' }
      ]

      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'desafios_otp') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  lt: vi.fn().mockResolvedValue({ data: mockPendentes, error: null })
                })
              }),
              update: updateMock
            }
          }
          if (table === 'concessoes_recuperacao') {
            return {
              select: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  lt: vi.fn().mockResolvedValue({ data: [{ id: 'gr-1' }], error: null })
                })
              })
            }
          }
          return {}
        })
      }

      const res = await reconciliarDesafios(mockSupabase as any)

      expect(res.desafiosExpirados).toBe(2)
      expect(res.concessoesExpiradas).toBe(1)
    })
  })
})
