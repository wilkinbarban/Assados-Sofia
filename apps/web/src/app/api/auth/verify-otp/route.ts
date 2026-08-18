import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { normalizeCuritibaPhone } from '@/lib/auth/phone'

const verifyOtpSchema = z.object({
  telefone: z.string().min(1, 'Telefone é obrigatório'),
  codigo: z.string().length(6, 'O código deve possuir exatamente 6 caracteres'),
  endereco: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    // 1. Autenticar o usuário
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado. Faça login para continuar.' },
        { status: 401 }
      )
    }

    // 2. Parsear e validar o corpo da requisição
    const body = await request.json().catch(() => ({}))
    const parsed = verifyOtpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    // 3. Sanitizar o número de telefone (Curitiba: 55419XXXXXXXX)
    const sanitized = normalizeCuritibaPhone(parsed.data.telefone)
    if (!sanitized) {
      return NextResponse.json(
        { error: 'Telefone inválido para a região de Curitiba.' },
        { status: 400 }
      )
    }

    // 4. Buscar o código ativo correspondente no banco (usando admin client)
    const supabaseAdmin = createAdminClient()

    // Segurança (HS-03): Filtrar obrigatoriamente por usuario_id = user.id
    const { data: codigos, error: selectError } = await supabaseAdmin
      .from('codigos_verificacao')
      .select('*')
      .eq('telefone', sanitized)
      .eq('usuario_id', user.id)
      .eq('verificado', false)
      .order('data_criacao', { ascending: false })

    if (selectError) {
      console.error('Erro ao buscar código de verificação:', selectError)
      return NextResponse.json(
        { error: 'Erro ao validar o código.' },
        { status: 500 }
      )
    }

    if (!codigos || codigos.length === 0) {
      return NextResponse.json(
        { error: 'Código de verificação incorreto ou inválido.' },
        { status: 400 }
      )
    }

    const latestOtp = codigos[0]

    // 4.1. Limitar número de tentativas falhas (HD-01 / Throttling)
    if (latestOtp.tentativas >= 3) {
      return NextResponse.json(
        { error: 'Número máximo de tentativas de verificação excedido. Solicite um novo código.' },
        { status: 429 }
      )
    }

    // 5. Validar tempo de expiração do código (10 minutos de validade)
    const agora = new Date()
    const expiraEm = new Date(latestOtp.expira_em)
    if (agora > expiraEm) {
      return NextResponse.json(
        { error: 'O código de verificação expirou. Solicite um novo.' },
        { status: 400 }
      )
    }

    // 5.1. Verificar o código digitado
    if (latestOtp.codigo !== parsed.data.codigo) {
      // Incrementar tentativas de forma atômica no banco de dados para evitar condições de corrida (race conditions)
      const { error: attemptError } = await supabaseAdmin.rpc('incrementar_tentativas_otp', {
        p_otp_id: latestOtp.id
      })

      if (attemptError) {
        console.error('Erro ao incrementar tentativas de OTP:', attemptError)
      }

      const tentativasRestantes = 3 - (latestOtp.tentativas + 1)
      const msgRestantes = tentativasRestantes > 0
        ? ` Você tem mais ${tentativasRestantes} tentativa(s).`
        : ' O código foi bloqueado.'

      return NextResponse.json(
        { error: `Código de verificação incorreto.${msgRestantes}` },
        { status: 400 }
      )
    }

    // 6. Marcar o código OTP como verificado/utilizado para evitar reutilização
    const { error: updateError } = await supabaseAdmin
      .from('codigos_verificacao')
      .update({ verificado: true })
      .eq('id', latestOtp.id)

    if (updateError) {
      console.error('Erro ao atualizar código para verificado:', updateError)
      return NextResponse.json(
        { error: 'Erro interno ao processar a validação do código.' },
        { status: 500 }
      )
    }

    // 7. Chamar a RPC SQL `mesclar_contas` para realizar a fusão atômica e segura
    const { error: rpcError } = await supabaseAdmin.rpc('mesclar_contas', {
      p_usuario_id: user.id,
      p_telefone: sanitized,
      p_endereco: parsed.data.endereco || null
    })

    if (rpcError) {
      console.error('Erro ao executar RPC mesclar_contas:', rpcError)
      return NextResponse.json(
        { error: 'Erro ao vincular o telefone à sua conta no banco de dados.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Telefone verificado e conta associada com sucesso.'
    })
  } catch (error) {
    console.error('Erro não tratado no handler POST /api/auth/verify-otp:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
