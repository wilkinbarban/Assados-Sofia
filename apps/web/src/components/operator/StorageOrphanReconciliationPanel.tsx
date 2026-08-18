'use client'

import { useEffect, useRef, useState } from 'react'
import type { StorageOrphanReconciliationListItem } from '@/app/actions/storage-orphan-reconciliation'
import { AdminNotice } from './ui/AdminNotice'
import { AdminPanel } from './ui/AdminPanel'
import { AdminStatusBadge } from './ui/AdminStatusBadge'
import { ConfirmActionDialog } from './ui/ConfirmActionDialog'

type ReconciliationMutationResult =
  | { readonly success: true; readonly approved?: boolean }
  | { readonly success: false; readonly error: string }

interface StorageOrphanReconciliationPanelProps {
  readonly initialReconciliations: readonly StorageOrphanReconciliationListItem[]
  readonly approveReconciliation: (reconciliationId: string) => Promise<ReconciliationMutationResult>
  readonly executeReconciliation: (reconciliationId: string) => Promise<ReconciliationMutationResult>
}

const statusTone = {
  pending: 'warning',
  approved: 'info',
  claimed: 'info',
  completed: 'success',
  protected: 'neutral',
  failed: 'error',
} as const

export function StorageOrphanReconciliationPanel({
  initialReconciliations,
  approveReconciliation,
  executeReconciliation,
}: StorageOrphanReconciliationPanelProps) {
  const [reconciliations, setReconciliations] = useState(initialReconciliations)
  const [selectedForApproval, setSelectedForApproval] = useState<string | null>(null)
  const [selectedForExecution, setSelectedForExecution] = useState<string | null>(null)
  const [approvalFocusTarget, setApprovalFocusTarget] = useState<HTMLElement | null>(null)
  const [executionFocusTarget, setExecutionFocusTarget] = useState<HTMLElement | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [shouldFocusResult, setShouldFocusResult] = useState(false)
  const resultNoticeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shouldFocusResult || !notice) return

    resultNoticeRef.current?.focus()
    setShouldFocusResult(false)
  }, [notice, shouldFocusResult])

  const approveSelected = async () => {
    if (!selectedForApproval) return

    setBusyId(selectedForApproval)
    const result = await approveReconciliation(selectedForApproval)
    setBusyId(null)
    setSelectedForApproval(null)

    if (!result.success || !result.approved) {
      setNotice(result.success ? 'A reconciliação não pode ser aprovada neste estado.' : result.error)
      return
    }

    setReconciliations((current) => current.map((item) => (
      item.id === selectedForApproval
        ? { ...item, status: 'approved', approvedAt: new Date().toISOString() }
        : item
    )))
    setNotice('Aprovação registrada.')
    setShouldFocusResult(true)
  }

  const executeSelected = async () => {
    if (!selectedForExecution) return

    const reconciliationId = selectedForExecution
    setBusyId(reconciliationId)
    const result = await executeReconciliation(reconciliationId)
    setBusyId(null)
    setSelectedForExecution(null)
    setNotice(result.success ? 'Remoção concluída.' : result.error)
    if (result.success) {
      setReconciliations((current) => current.map((item) => (
        item.id === reconciliationId
          ? { ...item, status: 'completed', completedAt: new Date().toISOString() }
          : item
      )))
      setShouldFocusResult(true)
    }
  }

  const reconciliationSelectedForExecution = selectedForExecution
    ? reconciliations.find((reconciliation) => reconciliation.id === selectedForExecution) ?? null
    : null

  return (
    <AdminPanel description="A varredura apenas registra candidatos. A remoção exige aprovação e execução explícitas." title="Reconciliação de imagens órfãs">
      <div className="space-y-4">
        <AdminNotice tone="warning">Nenhum arquivo é removido automaticamente.</AdminNotice>
        {notice ? (
          <div
            className="rounded-xl outline-none focus:ring-2 focus:ring-sky-400/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
            data-testid="reconciliation-result"
            ref={resultNoticeRef}
            tabIndex={-1}
          >
            <AdminNotice tone="info">{notice}</AdminNotice>
          </div>
        ) : null}
        {reconciliations.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-center text-xs font-medium text-zinc-400" role="status">
            Nenhum candidato pendente de reconciliação.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-950/70 text-zinc-400">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Objeto</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-3 py-2.5 font-semibold">Tentativas</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {reconciliations.map((reconciliation) => {
                  const isApproved = reconciliation.status === 'approved'
                  const isBusy = busyId === reconciliation.id
                  return (
                    <tr key={reconciliation.id} className="bg-zinc-900/40 text-zinc-300">
                      <td className="max-w-72 px-3 py-3 font-mono text-[11px] text-zinc-300">{reconciliation.objectPath}</td>
                      <td className="px-3 py-3"><AdminStatusBadge tone={statusTone[reconciliation.status]}>{reconciliation.status}</AdminStatusBadge></td>
                      <td className="px-3 py-3 text-zinc-400">{reconciliation.attempts}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={reconciliation.status !== 'pending' || isBusy}
                            onClick={(event) => {
                              setApprovalFocusTarget(event.currentTarget)
                              setSelectedForApproval(reconciliation.id)
                            }}
                            type="button"
                          >
                            Aprovar
                          </button>
                          <button
                            className="rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!isApproved || isBusy || selectedForExecution !== null}
                            onClick={(event) => {
                              setExecutionFocusTarget(event.currentTarget)
                              setSelectedForExecution(reconciliation.id)
                            }}
                            type="button"
                          >
                            Executar remoção
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedForApproval ? (
        <ConfirmActionDialog
          busy={busyId === selectedForApproval}
          confirmLabel="Confirmar aprovação"
          description="A aprovação permite uma remoção posterior, ainda explícita, deste objeto."
          onClose={() => setSelectedForApproval(null)}
          onConfirm={approveSelected}
          restoreFocusTo={approvalFocusTarget}
          title="Aprovar reconciliação"
        />
      ) : null}
      {reconciliationSelectedForExecution ? (
        <ConfirmActionDialog
          busy={busyId === reconciliationSelectedForExecution.id}
          confirmLabel="Confirmar remoção"
          description={`O objeto ${reconciliationSelectedForExecution.objectPath} está aprovado e será removido permanentemente. Esta ação não pode ser desfeita.`}
          onClose={() => setSelectedForExecution(null)}
          onConfirm={executeSelected}
          restoreFocusTo={executionFocusTarget}
          title="Confirmar remoção"
          tone="destructive"
        />
      ) : null}
    </AdminPanel>
  )
}
