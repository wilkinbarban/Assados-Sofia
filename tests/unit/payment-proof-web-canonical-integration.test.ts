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
  })

  it('uses the atomic queued intake RPC and hashes the original PDF bytes', () => {
    expect(intake).toContain("rpc('admit_and_enqueue_payment_proof'")
    expect(intake).toContain("createHash('sha256').update(input.bytes)")
  })

  it('only exposes admitted previews and projects them after human admission', () => {
    expect(preview).toContain("status")
    expect(preview).toContain("proof.status!=='admitted'")
    expect(admin).toContain("project_payment_proof_to_chat")
  })
})
