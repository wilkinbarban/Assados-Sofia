import type { ReactNode } from 'react'

const toneClasses = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  neutral: 'border-zinc-700 bg-zinc-800/70 text-zinc-300',
} as const

interface AdminStatusBadgeProps {
  readonly tone: keyof typeof toneClasses
  readonly children: ReactNode
}

export function AdminStatusBadge({ tone, children }: AdminStatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide ${toneClasses[tone]}`}>
      {children}
    </span>
  )
}
