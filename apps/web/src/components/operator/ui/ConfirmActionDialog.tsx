'use client'

import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertTriangle } from 'lucide-react'

const toneClasses = {
  warning: {
    icon: 'text-amber-500',
    confirm: 'bg-amber-500 text-zinc-950 hover:bg-amber-400',
  },
  destructive: {
    icon: 'text-rose-400',
    confirm: 'bg-rose-500 text-zinc-950 hover:bg-rose-400',
  },
} as const

interface ConfirmActionDialogProps {
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly onConfirm: () => void
  readonly onClose: () => void
  readonly busy?: boolean
  readonly tone?: keyof typeof toneClasses
  readonly restoreFocusTo?: HTMLElement | null
}

export function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
  tone = 'warning',
  restoreFocusTo,
}: ConfirmActionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusToRef = useRef(restoreFocusTo)
  const capturedOpenerRef = useRef(false)
  const initiallyBusyRef = useRef(busy)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!capturedOpenerRef.current) {
      const activeElement = document.activeElement
      openerRef.current = restoreFocusToRef.current ?? (activeElement instanceof HTMLElement ? activeElement : null)
      capturedOpenerRef.current = true
    }

    if (initiallyBusyRef.current) {
      dialogRef.current?.focus()
    } else {
      cancelButtonRef.current?.focus()
    }

    return () => {
      const opener = openerRef.current
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    if (busy) dialogRef.current?.focus()
  }, [busy])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (!busy) {
        event.preventDefault()
        onClose()
      }
      return
    }

    if (event.key !== 'Tab') return

    if (busy) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }

    const cancelButton = cancelButtonRef.current
    const confirmButton = confirmButtonRef.current
    if (!cancelButton || !confirmButton) return

    const activeElement = document.activeElement
    if (event.shiftKey && (activeElement === cancelButton || activeElement === dialogRef.current)) {
      event.preventDefault()
      confirmButton.focus()
      return
    }

    if (!event.shiftKey && (activeElement === confirmButton || activeElement === dialogRef.current)) {
      event.preventDefault()
      cancelButton.focus()
    }
  }

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl">
        <div className={`flex items-center gap-2.5 ${toneClasses[tone].icon}`}>
          <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          <h2 className="text-sm font-bold tracking-tight text-zinc-100" id={titleId}>{title}</h2>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300" id={descriptionId}>{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
            ref={cancelButtonRef}
            type="button"
          >
            Cancelar
          </button>
          <button
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone].confirm}`}
            disabled={busy}
            onClick={onConfirm}
            ref={confirmButtonRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
