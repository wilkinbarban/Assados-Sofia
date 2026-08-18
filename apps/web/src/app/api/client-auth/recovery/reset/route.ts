import { NextResponse } from 'next/server'
import { normalizeCuritibaPhone } from '@/lib/auth/phone'
import { executePasswordRecoverySaga } from '@/lib/auth/client-auth'
import { z } from 'zod'

const recoveryResetSchema = z.object({
  challengeId: z.string().min(1, 'ID de desafio é obrigatório'),
  telefone: z.string().min(1, 'O telefone é obrigatório'),
  codigo: z.string().length(6, 'O código deve ter 6 dígitos'),
  novaSenha: z.string().min(1, 'A nova senha é obrigatória'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = recoveryResetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { challengeId, telefone, codigo, novaSenha } = parsed.data

    const canonicalPhone = normalizeCuritibaPhone(telefone)
    if (!canonicalPhone) {
      return NextResponse.json(
        { error: 'Telefone inválido para a região de Curitiba.' },
        { status: 400 }
      )
    }

    const result = await executePasswordRecoverySaga({
      challengeId,
      phone: canonicalPhone,
      code: codigo,
      newPassword: novaSenha
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Não foi possível redefinir a senha.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Senha redefinida com sucesso.'
    })
  } catch (err: any) {
    console.error('[API Recovery Reset Error]', err)
    return NextResponse.json(
      { error: err.message || 'Erro ao redefinir a senha.' },
      { status: 500 }
    )
  }
}
