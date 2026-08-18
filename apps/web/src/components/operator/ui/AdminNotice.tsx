import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

const toneClasses = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
} as const

const toneIcons = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle2,
} as const

interface AdminNoticeProps {
  readonly tone: keyof typeof toneClasses
  readonly children: ReactNode
}

export function AdminNotice({ tone, children }: AdminNoticeProps) {
  const Icon = toneIcons[tone]

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${toneClasses[tone]}`} role="alert">
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
