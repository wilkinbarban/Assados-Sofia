'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Flame, Eye, EyeOff, Loader2, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'

// Zod validation schema for client-side login
const loginSchema = z.object({
  email: z.string().email('Insira um e-mail válido'),
  senha: z.string().min(1, 'A senha é obrigatória'),
})

type LoginForm = z.infer<typeof loginSchema>

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Form states
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  // UI States
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof LoginForm, string>>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  // Monitor query parameters for specific errors/messages (e.g. from middleware or registration)
  useEffect(() => {
    const errorParam = searchParams.get('erro')
    const registeredParam = searchParams.get('cadastrado')

    if (errorParam === 'inativo') {
      setApiError('Esta conta foi desativada pelo administrador. Entre em contato para mais informações.')
    } else if (errorParam === 'nao-autorizado') {
      setApiError('Você precisa fazer login para acessar esta página.')
    }

    if (registeredParam === 'true') {
      setInfoMessage('Cadastro realizado com sucesso! Verifique sua caixa de entrada para confirmar seu e-mail antes de fazer login.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setApiError(null)
    setInfoMessage(null)
    setIsLoading(true)

    // Validate using Zod schema
    const result = loginSchema.safeParse({ email, senha })
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginForm, string>> = {}
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof LoginForm
        fieldErrors[path] = issue.message
      })
      setErrors(fieldErrors)
      setIsLoading(false)
      return
    }

    try {
      // Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      })

      if (error) {
        // Specific user-friendly error messages based on Supabase error codes
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setApiError('Seu e-mail ainda não foi confirmado. Por favor, verifique seu e-mail e clique no link de ativação.')
        } else if (error.message.toLowerCase().includes('invalid login credentials')) {
          setApiError('E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.')
        } else {
          setApiError(error.message)
        }
      } else if (data.user) {
        // Fetch user profile function/active status to decide route
        const { data: perfil, error: perfilError } = await supabase
          .from('perfis')
          .select('funcao, ativo')
          .eq('id', data.user.id)
          .single()

        if (perfilError || !perfil) {
          // If profile fetch fails or no profile exists, let middleware handle or log out
          console.error('Perfil não encontrado:', perfilError)
          // Default path
          router.push('/cliente/verificar-telefone')
          return
        }

        // Account inactivation check (just in case middleware doesn't trigger immediately)
        if (perfil.ativo === false) {
          await supabase.auth.signOut()
          setApiError('Esta conta foi desativada pelo administrador. Entre em contato para mais informações.')
          setIsLoading(false)
          return
        }

        // Redirect based on role (funcao)
        if (perfil.funcao === 'admin') {
          router.push('/atendimento/admin')
        } else if (['supervisor', 'vendedor'].includes(perfil.funcao)) {
          router.push('/atendimento')
        } else {
          // Client flow: check if client record exists
          const { data: cliente } = await supabase
            .from('clientes')
            .select('id')
            .eq('usuario_id', data.user.id)
            .single()

          if (!cliente) {
            // Unverified phone block page
            router.push('/cliente/verificar-telefone')
          } else {
            // Already verified customer home page (default: Chat)
            router.push('/cliente/chat')
          }
        }
      }
    } catch (err) {
      console.error(err)
      setApiError('Ocorreu um erro inesperado ao tentar fazer login.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-radial from-zinc-900 via-zinc-950 to-black p-4 relative overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-0 -right-4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -left-4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md z-10 transition-all duration-300">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-linear-to-tr from-red-600 to-amber-500 flex items-center justify-center shadow-lg shadow-red-500/20 mb-3 animate-pulse">
            <Flame className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Asados Sofía
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Entre na sua conta para pedir o melhor assado
          </p>
        </div>

        {/* Login Card */}
        <div className="backdrop-blur-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-2xl transition-all duration-300">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Registration success info message */}
            {infoMessage && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl font-medium flex items-start space-x-2 animate-in fade-in duration-300">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{infoMessage}</span>
              </div>
            )}

            {/* Error message block */}
            {apiError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl font-medium flex items-start space-x-2 animate-in fade-in duration-300">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold block" htmlFor="email">
                E-mail
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-950/80 border border-zinc-800 focus:border-amber-500 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 transition-all font-medium"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold block" htmlFor="senha">
                  Senha
                </label>
                {/* Visual placeholder for recovery, not scoped, but nice UI */}
                <span className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors cursor-not-allowed">
                  Esqueceu a senha?
                </span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Sua senha"
                  className="w-full pl-10 pr-10 py-3 bg-zinc-950/80 border border-zinc-800 focus:border-amber-500 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.senha && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.senha}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-linear-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-lg shadow-red-600/20 hover:shadow-red-600/35 active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Autenticando...
                </>
              ) : (
                'Entrar'
              )}
            </button>

            <div className="text-center text-xs text-zinc-500 mt-4">
              Não possui uma conta?{' '}
              <Link href="/cadastro" className="text-amber-500 hover:text-amber-400 transition-colors font-semibold">
                Cadastre-se
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen w-full flex items-center justify-center bg-zinc-950 text-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </main>
    }>
      <LoginContent />
    </Suspense>
  )
}
