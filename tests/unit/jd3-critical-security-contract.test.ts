import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), requestOtpChallenge: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/otp/service', () => ({ requestOtpChallenge: mocks.requestOtpChallenge }))

import { POST as signup } from '@/app/api/client-auth/signup/route'
import { POST as verifySignup } from '@/app/api/client-auth/verify-signup/route'

const root = process.cwd()
const forward = () => readFileSync(join(root, 'supabase/migrations/20260824160000_jd3_security_authorities.sql'), 'utf8')

describe('JD3 critical security contracts', () => {
  it('does not mutate an existing confirmed account before OTP and gives an unconfirmed retry a non-enumerating continuation', async () => {
    const updateUserById = vi.fn()
    mocks.createAdminClient.mockReturnValue({ auth: { admin: {
      createUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'already registered', status: 422 } }),
      listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'confirmed', phone: '5541999999999', phone_confirmed_at: '2026-01-01' }] } }),
      updateUserById,
    } } })
    const response = await signup(new Request('http://test/signup', { method: 'POST', body: JSON.stringify({ nome: 'Maria', telefone: '41 99999-9999', senha: 'S3gura!123' }) }))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ success: false, continuation: 'CHECK_YOUR_EXISTING_SIGNUP_OR_RECOVER_ACCOUNT' })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('does not accept userId from the browser during signup completion', async () => {
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { usuario_id: 'bound-user' }, error: null }) })) })) })) })
    const response = await verifySignup(new Request('http://test/verify', { method: 'POST', body: JSON.stringify({ challengeId: 'challenge', telefone: '41 99999-9999', codigo: '123456', userId: 'attacker' }) }))
    expect(response.status).not.toBe(400)
  })

  it('adds service-only OTP authority, atomic binding, refund transition, and transactional anonymization', () => {
    const migration = forward()
    for (const name of ['solicitar_desafio_otp', 'ativar_desafio_otp', 'finalizar_desafio_otp', 'consumir_desafio_recuperacao', 'aplicar_concessao_recuperacao']) {
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}[\\s\\S]*from public, anon, authenticated`, 'i'))
    }
    expect(migration).toContain("v_desafio.usuario_id is distinct from p_usuario_id")
    expect(migration).toContain("'USUARIO_DESAFIO_INCORRETO'")
    expect(migration).toContain("'reembolsado'::public.status_pagamento")
    expect(migration).toContain('create or replace function public.anonymizar_usuario_admin')
    expect(migration).toContain('deleted_customer_phone_sequence')
    expect(migration).toContain('ANONYMIZED_PHONE_NAMESPACE_EXHAUSTED')
    expect(readFileSync(join(root, 'supabase/tests/jd3_security_authorities.sql'), 'utf8')).toContain('OTP mismatch did not reject bound identity')
    expect(readFileSync(join(root, 'supabase/tests/jd3_security_authorities.sql'), 'utf8')).toContain('deletion transaction lost immutable evidence')
    expect(migration).toContain('for update')
    expect(migration).not.toMatch(/delete\s+from\s+public\.itens_pedido/i)
  })
})

describe('JD3 final correction contracts', () => {
  it('keeps duplicate signup in a completable generic form state without OTP identifiers', async () => {
    mocks.createAdminClient.mockReturnValue({ auth: { admin: {
      createUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'already registered', status: 422 } }),
    } } })
    const response = await signup(new Request('http://test/signup', { method: 'POST', body: JSON.stringify({ nome: 'Maria', telefone: '41 99999-9999', senha: 'S3gura!123' }) }))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ success: false, continuation: 'CHECK_YOUR_EXISTING_SIGNUP_OR_RECOVER_ACCOUNT' })
  })

  it('uses a forward-only append-only Mercado Pago reversal and idempotent deletion workflow', () => {
    const migration = readFileSync(join(root, 'supabase/migrations/20260824162000_jd3_final_ledger_correction.sql'), 'utf8')
    expect(migration).toContain('provider_delivery_id')
    expect(migration).toContain('MERCADO_PAGO_REFUND_BEFORE_APPROVAL')
    expect(migration).toContain('MERCADO_PAGO_LATE_APPROVAL_IGNORED')
    expect(migration).toContain("'aprovado'::public.status_pagamento,'reembolsado'::public.status_pagamento")
    expect(migration).not.toMatch(/update\s+public\.pedido_payment_events\s+set\s+target_status/i)
    expect(migration).toContain('auth_delete_completed_at')
    expect(migration).toContain('concluir_anonymizacao_usuario_admin')
    expect(migration).toContain("auth_delete_pending',false")
  })

  it('converges refund-first deliveries without fabricating approval evidence', () => {
    const migration = readFileSync(join(root, 'supabase/migrations/20260824163000_mercado_pago_refund_first_terminality.sql'), 'utf8')
    expect(migration).toContain('provider_terminal_without_local_approval')
    expect(migration).toContain('provider_approval_observed_after_reversal')
    expect(migration).toContain('provider_reversal_duplicate_observation')
    expect(migration).toContain('MERCADO_PAGO_DELIVERY_CONFLICT')
    expect(migration).not.toContain('MERCADO_PAGO_REFUND_BEFORE_APPROVAL')
  })
})
