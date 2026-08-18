import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCuritibaPhone } from '@/lib/auth/phone'
import { validatePasswordPolicy } from '@/lib/auth/password-policy'
import { requestOtpChallenge } from '@/lib/otp/service'
import { z } from 'zod'

const signupSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  telefone: z.string().min(1, 'O telefone é obrigatório'),
  senha: z.string().min(1, 'A senha é obrigatória'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { nome, telefone, senha } = parsed.data

    // 1. Validar e normalizar telefone (Curitiba DDD 41)
    const canonicalPhone = normalizeCuritibaPhone(telefone)
    if (!canonicalPhone) {
      return NextResponse.json(
        { error: 'O telefone deve ser um celular de Curitiba com DDD 41 (^55419[0-9]{8}$).' },
        { status: 400 }
      )
    }

    // 2. Validar política de senha
    const policy = validatePasswordPolicy(senha)
    if (!policy.valid) {
      return NextResponse.json(
        { error: 'SENHA_FRACA', details: policy.errors },
        { status: 400 }
      )
    }

    // 3. Criar ou atualizar usuário não-confirmado no Supabase Auth
    const supabaseAdmin = createAdminClient()
    let userId: string

    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone: canonicalPhone,
      password: senha,
      user_metadata: { nome, name: nome },
      phone_confirm: false
    })

    if (createError) {
      // Se usuário já existe não-confirmado, atualizar senha e metadata
      if (createError.message?.toLowerCase().includes('already') || createError.status === 422) {
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = usersData?.users?.find(u => u.phone === canonicalPhone)
        if (existingUser) {
          userId = existingUser.id
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: senha,
            user_metadata: { nome, name: nome }
          })
        } else {
          return NextResponse.json({ error: createError.message }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: createError.message }, { status: 400 })
      }
    } else {
      userId = createData.user.id
    }

    // 4. Obter IP de origem
    const ipOrigem = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'

    // 5. Emitir desafio de OTP para cadastro
    const challenge = await requestOtpChallenge(canonicalPhone, 'signup', ipOrigem, userId)

    return NextResponse.json({
      success: true,
      challengeId: challenge.challengeId,
      expiraEm: challenge.expiraEm,
      channel: challenge.channel,
      provider: challenge.provider,
      userId
    })
  } catch (err: any) {
    console.error('[API Signup Error]', err)
    return NextResponse.json(
      { error: err.message || 'Erro ao processar cadastro.' },
      { status: 500 }
    )
  }
}
