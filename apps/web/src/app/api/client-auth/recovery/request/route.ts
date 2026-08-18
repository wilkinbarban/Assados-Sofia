import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCuritibaPhone } from '@/lib/auth/phone'
import { requestOtpChallenge } from '@/lib/otp/service'
import { z } from 'zod'

const recoveryRequestSchema = z.object({
  telefone: z.string().min(1, 'O telefone é obrigatório'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = recoveryRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { telefone } = parsed.data
    const canonicalPhone = normalizeCuritibaPhone(telefone)
    if (!canonicalPhone) {
      return NextResponse.json(
        { error: 'O telefone deve ser um celular de Curitiba com DDD 41 (^55419[0-9]{8}$).' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()

    // Verificar se existe cliente cadastrado com este telefone
    const { data: cliente } = await supabaseAdmin
      .from('clientes')
      .select('id')
      .eq('telefone', canonicalPhone)
      .maybeSingle()

    // Se o cliente não existir, retorna resposta genérica para mitigar enumeração de contas
    if (!cliente) {
      return NextResponse.json({
        success: true,
        message: 'Se o telefone estiver cadastrado, um código de verificação será enviado.',
        challengeId: null
      })
    }

    const ipOrigem = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
    const challenge = await requestOtpChallenge(canonicalPhone, 'recovery', ipOrigem)

    return NextResponse.json({
      success: true,
      challengeId: challenge.challengeId,
      expiraEm: challenge.expiraEm
    })
  } catch (err: any) {
    console.error('[API Recovery Request Error]', err)
    return NextResponse.json(
      { error: err.message || 'Erro ao solicitar recuperação de senha.' },
      { status: 500 }
    )
  }
}
