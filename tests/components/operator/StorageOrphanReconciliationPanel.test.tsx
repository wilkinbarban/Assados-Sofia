import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageOrphanReconciliationListItem } from '@/app/actions/storage-orphan-reconciliation'
import { StorageOrphanReconciliationPanel } from '@/components/operator/StorageOrphanReconciliationPanel'

const pendingReconciliation: StorageOrphanReconciliationListItem = {
  id: '6de82d63-0701-49fa-93ef-75bf154b9b77',
  objectPath: 'produtos/picanha/1/full.webp',
  objectCreatedAt: '2026-07-19T12:00:00.000Z',
  discoveredAt: '2026-07-20T12:00:00.000Z',
  status: 'pending',
  attempts: 0,
  error: null,
  approvedAt: null,
  completedAt: null,
}

const approvedReconciliation: StorageOrphanReconciliationListItem = {
  ...pendingReconciliation,
  status: 'approved',
  approvedAt: '2026-07-21T12:00:00.000Z',
}

describe('StorageOrphanReconciliationPanel', () => {
  afterEach(cleanup)

  it('requires confirmation before approving a pending reconciliation', async () => {
    const approveReconciliation = vi.fn().mockResolvedValue({ success: true, approved: true })
    render(
      <StorageOrphanReconciliationPanel
        approveReconciliation={approveReconciliation}
        executeReconciliation={vi.fn()}
        initialReconciliations={[pendingReconciliation]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Aprovar reconciliação')
    expect(approveReconciliation).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar aprovação' }))
    expect(await screen.findByText('Aprovação registrada.')).toBeInTheDocument()
    expect(approveReconciliation).toHaveBeenCalledWith(pendingReconciliation.id)
  })

  it('moves focus to the result notice when a successful approval disables its trigger', async () => {
    render(
      <StorageOrphanReconciliationPanel
        approveReconciliation={vi.fn().mockResolvedValue({ success: true, approved: true })}
        executeReconciliation={vi.fn()}
        initialReconciliations={[pendingReconciliation]}
      />,
    )

    const approveButton = screen.getByRole('button', { name: 'Aprovar' })
    fireEvent.click(approveButton)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar aprovação' }))

    expect(await screen.findByTestId('reconciliation-result')).toHaveFocus()
    expect(approveButton).toBeDisabled()
  })

  it('only enables execution for approved reconciliations', () => {
    render(
      <StorageOrphanReconciliationPanel
        approveReconciliation={vi.fn()}
        executeReconciliation={vi.fn()}
        initialReconciliations={[pendingReconciliation]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Executar remoção' })).toBeDisabled()
  })

  it('requires a destructive confirmation with the approved object path before execution', () => {
    const executeReconciliation = vi.fn().mockResolvedValue({ success: true })
    render(
      <StorageOrphanReconciliationPanel
        approveReconciliation={vi.fn()}
        executeReconciliation={executeReconciliation}
        initialReconciliations={[approvedReconciliation]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Executar remoção' }))

    expect(screen.getByRole('dialog', { name: 'Confirmar remoção' })).toHaveTextContent(approvedReconciliation.objectPath)
    expect(screen.getByRole('dialog', { name: 'Confirmar remoção' })).toHaveTextContent('será removido permanentemente')
    expect(executeReconciliation).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }))

    expect(executeReconciliation).toHaveBeenCalledWith(approvedReconciliation.id)
  })

  it('moves focus to the result notice when successful execution disables its trigger', async () => {
    render(
      <StorageOrphanReconciliationPanel
        approveReconciliation={vi.fn()}
        executeReconciliation={vi.fn().mockResolvedValue({ success: true })}
        initialReconciliations={[approvedReconciliation]}
      />,
    )

    const executeButton = screen.getByRole('button', { name: 'Executar remoção' })
    fireEvent.click(executeButton)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }))

    await waitFor(() => {
      expect(screen.getByTestId('reconciliation-result')).toHaveFocus()
    })
    expect(executeButton).toBeDisabled()
  })

  it('does not execute an approved reconciliation when the destructive confirmation is cancelled or escaped', () => {
    const executeReconciliation = vi.fn().mockResolvedValue({ success: true })
    render(
      <StorageOrphanReconciliationPanel
        approveReconciliation={vi.fn()}
        executeReconciliation={executeReconciliation}
        initialReconciliations={[approvedReconciliation]}
      />,
    )

    const executeButton = screen.getByRole('button', { name: 'Executar remoção' })
    executeButton.focus()
    fireEvent.click(executeButton)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(executeReconciliation).not.toHaveBeenCalled()
    expect(executeButton).toHaveFocus()

    fireEvent.click(executeButton)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Confirmar remoção' }), { key: 'Escape' })

    expect(executeReconciliation).not.toHaveBeenCalled()
    expect(executeButton).toHaveFocus()
  })

  it('shows an accessible empty state while preserving the automatic deletion warning', () => {
    render(
      <StorageOrphanReconciliationPanel
        approveReconciliation={vi.fn()}
        executeReconciliation={vi.fn()}
        initialReconciliations={[]}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Nenhum arquivo é removido automaticamente.')
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum candidato pendente de reconciliação.')
  })
})
