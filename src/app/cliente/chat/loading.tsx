import React from 'react'
import { Loader2 } from 'lucide-react'

export default function ChatLoading() {
  return (
    <div className="flex-1 bg-zinc-950 flex items-center justify-center p-8 h-full w-full">
      <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-300">
        <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
        <p className="text-sm text-zinc-400">Carregando o chat...</p>
      </div>
    </div>
  )
}
