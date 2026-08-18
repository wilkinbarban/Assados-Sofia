'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, User } from 'lucide-react'

export default function ClienteNav() {
  const pathname = usePathname()
  const isChatActive = pathname?.startsWith('/cliente/chat') || false
  const isPerfilActive = pathname?.startsWith('/cliente/perfil') || false

  return (
    <nav className="flex space-x-1.5" id="cliente-nav-tabs">
      <Link
        href="/cliente/chat"
        className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          isChatActive
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-500/10'
            : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
        }`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        <span>Chat com Sofía</span>
      </Link>
      <Link
        href="/cliente/perfil"
        className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          isPerfilActive
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-500/10'
            : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
        }`}
      >
        <User className="h-3.5 w-3.5" />
        <span>Meu Perfil</span>
      </Link>
    </nav>
  )
}
