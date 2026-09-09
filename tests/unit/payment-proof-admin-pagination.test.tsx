import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PaymentProofAdminPanel from '@/components/operator/PaymentProofAdminPanel'

const safeDiagnostics = () => Promise.resolve({ success: false, error: 'FORBIDDEN' })
const safeGateDiagnostics = () => Promise.resolve({ success: false, error: 'FORBIDDEN' })

const proofs = (count: number, status = 'review') =>
  Array.from({ length: count }, (_, index) => ({
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    customer_id: null,
    customer_name: `Customer ${index + 1}`,
    channel: 'telegram',
    status,
    preview_url: `/api/payment-proofs/${index + 1}/preview`,
    original_url: `/api/payment-proofs/${index + 1}/original`,
    suggested_cents: 4200,
    confirmed_cents: null,
    extraction_confidence: 0.91,
    purge_after: null,
    created_at: '2026-08-26T12:00:00.000Z',
  }))

afterEach(cleanup)

describe('PaymentProofAdminPanel pagination', () => {
  it('uses the remaining flex height instead of full parent height', () => {
    const source = readFileSync('apps/web/src/components/operator/PaymentProofAdminPanel.tsx', 'utf8')
    const rootPanel = source.match(/return \(\s*<div className="([^"]+)"/)?.[1]

    expect(rootPanel).toBeDefined()
    expect(rootPanel?.split(/\s+/)).not.toContain('h-full')
    expect(rootPanel?.split(/\s+/)).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']))
  })

  it('keeps the selected queue reachable in accessible pages of exactly ten proofs', () => {
    render(<PaymentProofAdminPanel initialProofs={proofs(21)} diagnostics={safeDiagnostics} gateDiagnostics={safeGateDiagnostics} mutate={vi.fn()} />)

    expect(screen.getByLabelText('Resultados de comprovantes')).toHaveClass('min-h-0', 'overflow-y-auto')
    expect(screen.getByText('Customer 1')).toBeInTheDocument()
    expect(screen.getByText('Customer 10')).toBeInTheDocument()
    expect(screen.queryByText('Customer 11')).not.toBeInTheDocument()
    expect(screen.getByText('Mostrando 1–10 de 21 comprovantes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('Customer 11')).toBeInTheDocument()
    expect(screen.getByText('Customer 20')).toBeInTheDocument()
    expect(screen.queryByText('Customer 21')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('Customer 21')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 21–21 de 21 comprovantes')).toBeInTheDocument()
  })

  it('handles exact ten- and twenty-proof boundaries without dropping a proof', () => {
    const props = { diagnostics: safeDiagnostics, gateDiagnostics: safeGateDiagnostics, mutate: vi.fn() }
    render(<PaymentProofAdminPanel initialProofs={proofs(10)} {...props} />)
    expect(screen.getByText('Mostrando 1–10 de 10 comprovantes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Próxima página' })).not.toBeInTheDocument()

    cleanup()
    render(<PaymentProofAdminPanel initialProofs={proofs(20)} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('Customer 20')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 11–20 de 20 comprovantes')).toBeInTheDocument()
  })

  it('resets pagination when the selected status queue changes', () => {
    render(<PaymentProofAdminPanel initialProofs={[...proofs(11), ...proofs(1, 'quarantined')]} diagnostics={safeDiagnostics} gateDiagnostics={safeGateDiagnostics} mutate={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('Customer 11')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /quarentena/i }))
    expect(screen.getByText('Mostrando 1–1 de 1 comprovantes')).toBeInTheDocument()
    expect(screen.getByText('Customer 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Próxima página' })).not.toBeInTheDocument()
  })
})
