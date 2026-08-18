import type { ReactNode } from 'react'

interface AdminPanelProps {
  readonly title: string
  readonly children: ReactNode
  readonly description?: string
}

export function AdminPanel({ title, children, description }: AdminPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-xl shadow-black/10">
      <header className="mb-4 space-y-1">
        <h2 className="text-sm font-bold tracking-tight text-zinc-100">{title}</h2>
        {description ? <p className="text-xs leading-relaxed text-zinc-400">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}
