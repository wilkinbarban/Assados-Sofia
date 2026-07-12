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
    <nav className="flex space-x-1" id="cliente-nav-tabs">
      <Link
        href="/cliente/chat"
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isChatActive
            ? 'bg-zinc-900 text-white border border-zinc-800'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <MessageSquare className="h-4 w-4" />
        <span>Chat</span>
      </Link>
      <Link
        href="/cliente/perfil"
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isPerfilActive
            ? 'bg-zinc-900 text-white border border-zinc-800'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <User className="h-4 w-4" />
        <span>Perfil</span>
      </Link>
    </nav>
  )
}
