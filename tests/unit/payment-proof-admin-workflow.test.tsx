import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PaymentProofAdminPanel, { quarantineCountdown } from '@/components/operator/PaymentProofAdminPanel'

const proof = {
  id: '11111111-1111-4111-8111-111111111111', customer_id: null, customer_name: null,
  channel: 'telegram', status: 'quarantined', preview_url: '/api/payment-proofs/1/preview',
  original_url: '/api/payment-proofs/1/original', suggested_cents: 4200, confirmed_cents: null,
  extraction_confidence: 0.91, purge_after: '2026-09-05T12:00:00.000Z', created_at: '2026-08-26T12:00:00.000Z',
}
afterEach(cleanup)

describe('Comprovantes PIX admin workflow', () => {
  it('uses the server deadline for the ten-day countdown', () => {
    expect(quarantineCountdown(proof.purge_after, new Date('2026-08-27T12:00:00Z'))).toBe('9d 0h')
  })

  it('renders filter buttons, metadata, private routes, an on-demand PNG preview, and confirmation actions', () => {
    const mutate = vi.fn().mockResolvedValue({ success: true })
    render(<PaymentProofAdminPanel initialProofs={[proof]} mutate={mutate} now="2026-08-27T12:00:00Z" />)
    expect(screen.getByRole('heading', { name: 'Comprovantes PIX' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quarentena.*1/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Confiança da análise')).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vista Previa' }))
    expect(screen.getByRole('dialog', { name: /comprovante pix/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /comprovante pix ampliado/i })).toHaveAttribute('src', proof.preview_url)
    fireEvent.click(screen.getByRole('button', { name: /fechar prévia/i }))
    expect(screen.getByRole('link', { name: /pdf original/i })).toHaveAttribute('href', proof.original_url)
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar restauração' }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'restore', proofId: proof.id }))
  })

  it('shows an accessible empty state', () => {
    render(<PaymentProofAdminPanel initialProofs={[]} mutate={vi.fn()} now="2026-08-27T12:00:00Z" />)
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum comprovante nesta fila')
  })

  it('shows the quarantine deadline immediately after rejecting without a reload', async () => {
    const mutate = vi.fn().mockResolvedValue({
      success: true,
      proof: { status: 'quarantined', purge_after: '2026-09-06T12:00:00.000Z' },
    })
    render(<PaymentProofAdminPanel
      initialProofs={[{ ...proof, status: 'review', purge_after: null }]}
      mutate={mutate}
      now="2026-08-27T12:00:00Z"
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ação' }))

    expect(await screen.findByText('10d 0h')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})

it('selects one or many eligible orders and reconciles only an exact total', async () => {
  const mutate = vi.fn().mockResolvedValue({ success: true })
  const admitted = { ...proof, status: 'admitted', customer_id: '33333333-3333-4333-8333-333333333321', confirmed_cents: 4200 }
  const orders = [
    { id: '33333333-3333-4333-8333-333333333341', customer_id: admitted.customer_id, total_pedido_centavos: 2000, status: 'confirmado', status_pagamento: 'pendente' },
    { id: '33333333-3333-4333-8333-333333333342', customer_id: admitted.customer_id, total_pedido_centavos: 2200, status: 'confirmado', status_pagamento: 'pendente' },
  ]
  render(<PaymentProofAdminPanel initialProofs={[admitted]} initialOrders={orders} mutate={mutate} now="2026-08-27T12:00:00Z" />)
  fireEvent.click(screen.getByRole('checkbox', { name: /pedido .*3341/i }))
  expect(screen.getByRole('button', { name: /conciliar/i })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /pedido .*3342/i }))
  expect(screen.getByText('Selecionado: R$ 42,00 · Comprovante: R$ 42,00')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /conciliar/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar conciliação' }))
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'reconcile', proofId: admitted.id, orderIds: orders.map(order => order.id) }))
})
