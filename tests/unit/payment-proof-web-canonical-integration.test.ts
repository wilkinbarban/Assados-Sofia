import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pedidos = readFileSync('apps/web/src/app/actions/pedidos.ts', 'utf8')
const intake = readFileSync('apps/web/src/lib/payment-proofs/canonical-intake.ts', 'utf8')
const preview = readFileSync('apps/web/src/app/api/payment-proofs/[id]/preview/route.ts', 'utf8')
const admin = readFileSync('apps/web/src/app/actions/payment-proof-admin.ts', 'utf8')

describe('canonical web payment-proof integration', () => {
  it('routes the web upload through the canonical PDF-only processor', () => {
    expect(pedidos).toContain('processCanonicalPaymentProof')
    expect(pedidos).not.toContain("status: 'review'")
    expect(pedidos).not.toContain("mime_type: isPdf ? 'application/pdf' : 'image/png'")
    expect(pedidos).not.toContain("nome_arquivo: payload.nomeArquivo || (isPdf ?")
    expect(pedidos).toContain('conversationId: conversaId')
  })

  it('uses the atomic queued intake RPC, hashes the original PDF bytes, and sends its authoritative conversation', () => {
    expect(intake).toContain("rpc('admit_and_enqueue_payment_proof'")
    expect(intake).toContain("createHash('sha256').update(input.bytes)")
    expect(intake).toContain('conversationId?: string | null')
    expect(intake).toContain('p_conversation_id: input.conversationId ?? null')
  })

  it('keeps confirmation and reconciliation leased, while chat visibility remains DB-authoritative', () => {
    expect(admin).toContain("rpc = 'confirm_payment_proof_amount'")
    expect(admin).toContain("rpc = 'reconcile_payment_proof'")
    expect(admin).toContain('p_lease_token: input.leaseToken')
    expect(admin).toContain("rpc('acquire_payment_proof_lease'")
    expect(admin).not.toContain('project_payment_proof_to_chat')
    expect(preview).toMatch(/proof\.status\s*!==\s*['"]admitted['"]/)
    expect(preview).toMatch(/from\(['"]payment_proofs['"]\)\.select\(['"]id,customer_id,status,preview_storage_key['"]\)/)
    expect(preview).not.toContain('project_payment_proof_to_chat')
  })
})
