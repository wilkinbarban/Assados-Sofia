import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminNotice } from '@/components/operator/ui/AdminNotice'
import { AdminPanel } from '@/components/operator/ui/AdminPanel'
import { AdminStatusBadge } from '@/components/operator/ui/AdminStatusBadge'
import { ConfirmActionDialog } from '@/components/operator/ui/ConfirmActionDialog'

function ConfirmActionDialogHarness() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button">Abrir confirmação</button>
      {isOpen ? (
        <ConfirmActionDialog
          confirmLabel="Aprovar"
          description="A aprovação não remove o arquivo."
          onClose={() => setIsOpen(false)}
          onConfirm={() => undefined}
          title="Aprovar reconciliação"
        />
      ) : null}
    </>
  )
}

function DisabledOpenerDialogHarness() {
  const [isOpen, setIsOpen] = useState(false)
  const [restoreFocusTo, setRestoreFocusTo] = useState<HTMLElement | null>(null)

  return (
    <>
      <button
        disabled={isOpen}
        onClick={(event) => {
          setRestoreFocusTo(event.currentTarget)
          event.currentTarget.blur()
          setIsOpen(true)
        }}
        type="button"
      >
        Abrir ação destrutiva
      </button>
      {isOpen ? (
        <ConfirmActionDialog
          confirmLabel="Remover"
          description="A remoção é permanente."
          onClose={() => setIsOpen(false)}
          onConfirm={() => undefined}
          restoreFocusTo={restoreFocusTo}
          title="Confirmar remoção"
          tone="destructive"
        />
      ) : null}
    </>
  )
}

describe('operator admin UI primitives', () => {
  afterEach(cleanup)

  it('renders semantic notice and status content', () => {
    render(
      <AdminPanel title="Reconciliações">
        <AdminNotice tone="warning">Nenhum arquivo será removido automaticamente.</AdminNotice>
        <AdminStatusBadge tone="warning">Pendente</AdminStatusBadge>
      </AdminPanel>,
    )

    expect(screen.getByRole('heading', { name: 'Reconciliações' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Nenhum arquivo será removido automaticamente.')
    expect(screen.getByText('Pendente')).toBeInTheDocument()
  })

  it('requires an explicit confirmation before invoking the critical action', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmActionDialog
        title="Aprovar reconciliação"
        description="A aprovação não remove o arquivo."
        confirmLabel="Aprovar"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('names the dialog, focuses its safe action, closes on Escape, and restores the invoking focus', () => {
    render(<ConfirmActionDialogHarness />)

    const opener = screen.getByRole('button', { name: 'Abrir confirmação' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Aprovar reconciliação' })
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('restores focus to an opener that is disabled while the dialog mounts', () => {
    render(<DisabledOpenerDialogHarness />)

    const opener = screen.getByRole('button', { name: 'Abrir ação destrutiva' })
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(opener).toHaveFocus()
  })

  it('traps Tab and Shift+Tab within the dialog actions', () => {
    render(
      <ConfirmActionDialog
        confirmLabel="Aprovar"
        description="A aprovação não remove o arquivo."
        onClose={() => undefined}
        onConfirm={() => undefined}
        title="Aprovar reconciliação"
      />,
    )

    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    const confirm = screen.getByRole('button', { name: 'Aprovar' })

    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()

    confirm.focus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(cancel).toHaveFocus()
  })

  it('does not close on Escape while busy', () => {
    const onClose = vi.fn()
    render(
      <ConfirmActionDialog
        busy
        confirmLabel="Aprovar"
        description="A aprovação não remove o arquivo."
        onClose={onClose}
        onConfirm={() => undefined}
        title="Aprovar reconciliação"
      />,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })
})
