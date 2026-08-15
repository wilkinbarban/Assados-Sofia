'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Flame, Eye, EyeOff, Loader2, CheckCircle2, User, Mail, Lock } from 'lucide-react'

// Zod validation schema for client-side registration
const cadastroSchema = z.object({
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Insira um e-mail válido'),
  senha: z
    .string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'A senha deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'A senha deve conter pelo menos um número'),
})

type CadastroForm = z.infer<typeof cadastroSchema>

export default function CadastroPage() {
  const router = useRouter()
  const supabase = createClient()

  // Form states
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  
  // UI States
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof CadastroForm, string>>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Real-time password validation helpers for visual feedback
  const hasMinLength = senha.length >= 8
  const hasUppercase = /[A-Z]/.test(senha)
  const hasLowercase = /[a-z]/.test(senha)
  const hasNumber = /[0-9]/.test(senha)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setApiError(null)
    setIsLoading(true)

    // Validate using Zod schema
    const result = cadastroSchema.safeParse({ nome, email, senha })
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof CadastroForm, string>> = {}
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof CadastroForm
        fieldErrors[path] = issue.message
      })
      setErrors(fieldErrors)
      setIsLoading(false)
      return
    }

    try {
      // Register user on Supabase with metadata
      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          data: {
            nome: nome,
          },
        },
      })

      if (error) {
        setApiError(error.message)
      } else {
        setSuccess(true)
        // Redireciona após 4 segundos para o login
        setTimeout(() => {
          router.push('/login?cadastrado=true')
        }, 4000)
      }
    } catch (err) {
      console.error(err)
      setApiError('Ocorreu um erro inesperado ao realizar o cadastro.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-radial from-zinc-900 via-zinc-950 to-black p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />

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
            Crie sua conta e garanta o melhor sabor de Curitiba
          </p>
        </div>

        {/* Success State Card */}
        {success ? (
          <div className="backdrop-blur-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="h-16 w-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 animate-bounce" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Conta criada!</h2>
            <p className="text-zinc-300 mb-6">
              Enviamos um link de confirmação para o e-mail <strong className="text-amber-500">{email}</strong>.
            </p>
            <p className="text-xs text-zinc-500">
              Você será redirecionado para a tela de login em alguns segundos...
            </p>
            <Link 
              href="/login"
              className="mt-6 text-sm text-amber-500 hover:text-amber-400 transition-colors underline font-medium"
            >
              Ir para o login agora
            </Link>
          </div>
        ) : (
          /* Register Card */
          <div className="backdrop-blur-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-2xl transition-all duration-300">
            <form onSubmit={handleSubmit} className="space-y-5">
              {apiError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl font-medium">
                  {apiError}
                </div>
              )}

              {/* Name Field */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold block" htmlFor="nome">
                  Nome Completo
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                    <User className="h-4 w-4" />
                  </span>
                  <input
                    id="nome"
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full pl-10 pr-4 py-3 bg-zinc-950/80 border border-zinc-800 focus:border-amber-500 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 transition-all font-medium"
                  />
                </div>
                {errors.nome && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.nome}</p>
                )}
              </div>

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
                <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold block" htmlFor="senha">
                  Senha
                </label>
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
                    placeholder="Mínimo de 8 caracteres"
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

                {/* Live Password Strength Indicator (Visual Polish) */}
                {senha.length > 0 && (
                  <div className="mt-3 p-3 bg-zinc-950/50 rounded-xl border border-zinc-800 space-y-1.5 animate-in fade-in duration-200">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Requisitos de Senha</p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <div className="flex items-center space-x-1.5 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${hasMinLength ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                        <span className={hasMinLength ? 'text-emerald-400 font-medium' : 'text-zinc-500'}>Mín. 8 caracteres</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${hasUppercase ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                        <span className={hasUppercase ? 'text-emerald-400 font-medium' : 'text-zinc-500'}>Letra maiúscula</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${hasLowercase ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                        <span className={hasLowercase ? 'text-emerald-400 font-medium' : 'text-zinc-500'}>Letra minúscula</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${hasNumber ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                        <span className={hasNumber ? 'text-emerald-400 font-medium' : 'text-zinc-500'}>Um número</span>
                      </div>
                    </div>
                  </div>
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
                    Criando sua conta...
                  </>
                ) : (
                  'Criar Conta'
                )}
              </button>

              <div className="text-center text-xs text-zinc-500 mt-4">
                Já possui uma conta?{' '}
                <Link href="/login" className="text-amber-500 hover:text-amber-400 transition-colors font-semibold">
                  Faça login
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
