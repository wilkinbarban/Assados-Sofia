import { NextResponse } from 'next/server'
import { normalizeCuritibaPhone } from '@/lib/auth/phone'
import { finalizeClientSignupSaga } from '@/lib/auth/client-auth'
import { z } from 'zod'

const verifySignupSchema = z.object({
  challengeId: z.string().min(1, 'ID de desafio é obrigatório'),
  telefone: z.string().min(1, 'O telefone é obrigatório'),
  codigo: z.string().length(6, 'O código deve ter 6 dígitos'),
  userId: z.string().min(1, 'ID de usuário é obrigatório'),
  nome: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = verifySignupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { challengeId, telefone, codigo, userId, nome } = parsed.data

    const canonicalPhone = normalizeCuritibaPhone(telefone)
    if (!canonicalPhone) {
      return NextResponse.json(
        { error: 'Telefone inválido para a região de Curitiba.' },
        { status: 400 }
      )
    }

    const result = await finalizeClientSignupSaga({
      challengeId,
      phone: canonicalPhone,
      code: codigo,
      userId,
      nome
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Código inválido ou expirado.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      clienteId: result.clienteId
    })
  } catch (err: any) {
    console.error('[API Verify Signup Error]', err)
    return NextResponse.json(
      { error: err.message || 'Erro ao verificar código de cadastro.' },
      { status: 500 }
    )
  }
}
