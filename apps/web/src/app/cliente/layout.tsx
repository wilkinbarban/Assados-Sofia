import React from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Flame, LogOut } from 'lucide-react'
import ClienteNav from '@/components/cliente/ClienteNav'

// Server Action for logout
async function handleLogout() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''
  const isVerificarTelefone = pathname === '/cliente/verificar-telefone'

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // If user is on the verify phone page, render children directly without header navigation
  if (isVerificarTelefone) {
    return <>{children}</>
  }

  // Query customers table to check if phone is verified
  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id')
    .eq('usuario_id', user.id)
    .single()

  if (clienteError || !cliente) {
    redirect('/cliente/verificar-telefone')
  }

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans animate-in fade-in duration-300 overflow-hidden">
      {/* Header bar */}
      <header className="border-b border-zinc-900 bg-zinc-900/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-xl bg-linear-to-tr from-red-600 to-amber-500 flex items-center justify-center shadow-md">
                <Flame className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight bg-linear-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Asados Sofía
              </span>
            </div>

            {/* Navigation Tabs */}
            <ClienteNav />
          </div>

          <form action={handleLogout}>
            <button
              type="submit"
              className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 py-1.5 px-3 rounded-lg font-medium cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sair</span>
            </button>
          </form>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
