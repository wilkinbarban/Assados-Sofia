import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PaymentProofAdminPanel, { quarantineCountdown } from '@/components/operator/PaymentProofAdminPanel'

const proof = { id: '11111111-1111-4111-8111-111111111111', customer_id: null, customer_name: null, channel: 'telegram', status: 'quarantined', preview_url: '/api/payment-proofs/1/preview', original_url: '/api/payment-proofs/1/original', suggested_cents: 4200, confirmed_cents: null, extraction_confidence: 0.91, purge_after: '2026-09-05T12:00:00.000Z', created_at: '2026-08-26T12:00:00.000Z' }
const leasedMutation = (proofResult = {}) => vi.fn().mockImplementation((input) => Promise.resolve(input.operation === 'acquire' ? { success: true, lease: { token: 'a'.repeat(64), expiresAt: '2026-08-27T12:05:00Z' } } : { success: true, ...proofResult }))
const safeDiagnostics = () => Promise.resolve({ success: false, error: 'FORBIDDEN' })
const safeGateDiagnostics = () => Promise.resolve({ success: false, error: 'FORBIDDEN' })
const panel = (props: React.ComponentProps<typeof PaymentProofAdminPanel>) => <PaymentProofAdminPanel diagnostics={safeDiagnostics} gateDiagnostics={safeGateDiagnostics} {...props}/>
afterEach(cleanup)

describe('Comprovantes PIX admin workflow', () => {
  it('uses the server deadline for the ten-day countdown', () => { expect(quarantineCountdown(proof.purge_after, new Date('2026-08-27T12:00:00Z'))).toBe('9d 0h') })
  it('renders private preview and restore confirmation', () => {
    const mutate = leasedMutation(); render(panel({initialProofs:[proof],mutate,now:'2026-08-27T12:00:00Z'}))
    expect(screen.getByRole('heading', { name: 'Comprovantes PIX' })).toBeInTheDocument(); expect(screen.getByText('91%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vista Previa' })); expect(screen.getByRole('img', { name: /comprovante pix ampliado/i })).toHaveAttribute('src', proof.preview_url)
    fireEvent.click(screen.getByRole('button', { name: /fechar prévia/i })); fireEvent.click(screen.getByRole('button', { name: 'Restaurar' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar restauração' }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'restore', proofId: proof.id }))
  })
  it('shows an accessible empty state', () => { render(panel({initialProofs:[],mutate:vi.fn(),now:'2026-08-27T12:00:00Z'})); expect(screen.getByRole('status')).toHaveTextContent('Nenhum comprovante nesta fila') })
  it('requires a local lease before rejection controls appear and releases after success', async () => {
    const mutate = leasedMutation({ proof: { status: 'quarantined', purge_after: '2026-09-06T12:00:00.000Z' } }); render(panel({initialProofs:[{...proof,status:'review',purge_after:null}],mutate,now:'2026-08-27T12:00:00Z'}))
    expect(screen.queryByRole('button', { name: 'Rejeitar' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Reservar análise' })); fireEvent.click(await screen.findByRole('button', { name: 'Rejeitar' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar ação' }))
    expect(await screen.findByText(/eliminação automática em: 10d 0h/i)).toBeInTheDocument(); expect(mutate).toHaveBeenCalledWith({ operation: 'release', proofId: proof.id, leaseToken: 'a'.repeat(64) })
  })
  it('allows vendedores to reject ordinary proofs', async () => { render(panel({initialProofs:[{...proof,status:'review'}],role:'vendedor',mutate:leasedMutation()})); fireEvent.click(screen.getByRole('button', { name: 'Reservar análise' })); expect(await screen.findByRole('button', { name: 'Rejeitar' })).toBeInTheDocument() })
  it('uses an explicit privileged manual replay request and preserves its key only for retry', async () => {
    const diagnostics = vi.fn().mockResolvedValue({ success: true, data: { processing_queue_dead_letter: 1, outbox_dead_letter: 2, unresolved_dead_letter: 3, oldest_unresolved_dead_letter_at: null, oldest_unresolved_dead_letter_age_seconds: null } }); const replay = vi.fn().mockResolvedValue({ success: true, outcome: 'ineligible' })
    render(panel({initialProofs:[proof],diagnostics,replay}))
    await waitFor(()=>expect(diagnostics).toHaveBeenCalledTimes(1)); expect(replay).not.toHaveBeenCalled(); expect(screen.getByText(/não resolvidos: 3/i)).toBeInTheDocument()
    const target=screen.getByRole('textbox',{name:/id alvo/i}); expect(screen.getByRole('button',{name:/reprocessar carta morta/i})).toBeDisabled(); fireEvent.change(target,{target:{value:proof.id}}); fireEvent.click(screen.getByRole('checkbox',{name:/confirmo/i})); fireEvent.click(screen.getByRole('button',{name:/reprocessar carta morta/i})); fireEvent.click(screen.getByRole('button',{name:/confirmar reprocessamento/i}))
    await screen.findByText(/não elegível/i); expect(replay).toHaveBeenCalledWith(expect.objectContaining({source:'processing_queue',targetId:proof.id,idempotencyKey:expect.stringMatching(/^[0-9a-f-]{36}$/i)}))
    fireEvent.change(screen.getByRole('combobox',{name:/fonte/i}),{target:{value:'outbox'}}); fireEvent.change(target,{target:{value:'09'}}); expect(screen.getByRole('button',{name:/reprocessar carta morta/i})).toBeDisabled(); fireEvent.change(target,{target:{value:'9'}}); fireEvent.click(screen.getByRole('checkbox',{name:/confirmo/i})); await waitFor(()=>expect(screen.getByRole('button',{name:/reprocessar carta morta/i})).toBeEnabled())
  })
  it('renders redacted operational gate state for privileged staff and hides it from vendedores', async () => {
    const gateDiagnostics = vi.fn().mockResolvedValue({ success: true, data: { canonicalIngest: { effective: false, reason: 'DISABLED' }, whatsappIngest: { effective: false, reason: 'MISSING' }, processing: { effective: false, reason: 'MALFORMED' }, sellerReconciliation: { effective: false, reason: 'DISABLED' }, privilegedReplay: { effective: false, reason: 'UNREADABLE' }, cleanup: { effective: false, reason: 'DISABLED' } } })
    render(panel({initialProofs:[proof],gateDiagnostics}))
    expect(await screen.findByLabelText(/portões operacionais/i)).toHaveTextContent(/entrada canônica: fechada.*disabled/i)
    expect(screen.getByLabelText(/portões operacionais/i)).toHaveTextContent(/limpeza: fechada.*disabled/i)
    cleanup(); render(panel({initialProofs:[proof],role:'vendedor',gateDiagnostics}))
    expect(screen.queryByLabelText(/portões operacionais/i)).not.toBeInTheDocument(); expect(gateDiagnostics).toHaveBeenCalledTimes(1)
  })
  it('hides diagnostics and replay controls from vendedores', () => { render(panel({initialProofs:[proof],role:'vendedor',replay:vi.fn()})); expect(screen.queryByText(/não resolvidos/i)).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: /reprocessar/i })).not.toBeInTheDocument() })
})

it('selects one or many eligible orders and reconciles only an exact total', async () => {
  const mutate = leasedMutation(); const admitted = { ...proof, status: 'admitted', customer_id: '33333333-3333-4333-8333-333333333321', confirmed_cents: 4200 }; const orders = [{ id: '33333333-3333-4333-8333-333333333341', customer_id: admitted.customer_id, total_pedido_centavos: 2000, status: 'confirmado', status_pagamento: 'pendente' }, { id: '33333333-3333-4333-8333-333333333342', customer_id: admitted.customer_id, total_pedido_centavos: 2200, status: 'confirmado', status_pagamento: 'pendente' }]
  render(panel({initialProofs:[admitted],initialOrders:orders,mutate,now:'2026-08-27T12:00:00Z'})); fireEvent.click(screen.getByRole('button', { name: 'Reservar análise' })); await screen.findByRole('button', { name: /conciliar/i }); fireEvent.click(screen.getByRole('checkbox', { name: /pedido .*3341/i })); expect(screen.getByRole('button', { name: /conciliar/i })).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox', { name: /pedido .*3342/i })); fireEvent.click(screen.getByRole('button', { name: /conciliar/i })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar conciliação' })); expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'reconcile', proofId: admitted.id, orderIds: orders.map(order => order.id), leaseToken: 'a'.repeat(64) }))
})
