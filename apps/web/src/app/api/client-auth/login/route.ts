import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeCuritibaPhone } from '@/lib/auth/phone'
import { z } from 'zod'

const loginSchema = z.object({
  telefone: z.string().min(1, 'O telefone é obrigatório'),
  senha: z.string().min(1, 'A senha é obrigatória'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = loginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { telefone, senha } = parsed.data

    const canonicalPhone = normalizeCuritibaPhone(telefone)
    if (!canonicalPhone) {
      return NextResponse.json(
        { error: 'Telefone inválido para a região de Curitiba.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      phone: canonicalPhone,
      password: senha
    })

    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Credenciais inválidas. Verifique seu telefone e senha.' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        phone: data.user.phone
      }
    })
  } catch (err: any) {
    console.error('[API Client Login Error]', err)
    return NextResponse.json(
      { error: 'Erro interno ao realizar login.' },
      { status: 500 }
    )
  }
}
