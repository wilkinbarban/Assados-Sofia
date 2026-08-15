import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { enviarOtpTelegram } from '@/lib/telegram/send'

const otpSchema = z.object({
  telefone: z.string().min(1, 'Telefone é obrigatório'),
})

/**
 * Detecta canais disponíveis para envio de OTP consultando o registro do cliente.
 * Retorna null se o cliente não existir (envio padrão via WhatsApp).
 */
async function detectarCanaisDisponiveis(supabaseAdmin: any, telefone: string) {
  const { data: cliente } = await supabaseAdmin
    .from('clientes')
    .select('id, telegram_chat_id, telefone')
    .eq('telefone', telefone)
    .maybeSingle()

  if (!cliente) {
    return { telegram: null, whatsapp: telefone, canal: 'whatsapp' as const }
  }

  const temTelegram = !!cliente.telegram_chat_id
  const temWhatsapp = !!cliente.telefone

  if (temTelegram && !temWhatsapp) {
    return { telegram: cliente.telegram_chat_id, whatsapp: null, canal: 'telegram' as const }
  }

  if (temTelegram && temWhatsapp) {
    // Ambos canais disponíveis: Telegram primeiro (mais confiável), WhatsApp como fallback
    return { telegram: cliente.telegram_chat_id, whatsapp: cliente.telefone, canal: 'telegram' as const, whatsappFallback: true }
  }

  return { telegram: null, whatsapp: telefone, canal: 'whatsapp' as const }
}

export async function POST(request: Request) {
  try {
    // 1. Autenticar o usuário na sessão web
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
    const parsed = otpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    // 3. Sanitizar e validar o número de telefone (Formato de Curitiba: 55419XXXXXXXX)
    let sanitized = parsed.data.telefone.replace(/\D/g, '')

    if (sanitized.length === 11 && sanitized.startsWith('419')) {
      sanitized = '55' + sanitized
    }

    const curitibaRegex = /^55419[0-9]{8}$/
    if (!curitibaRegex.test(sanitized)) {
      return NextResponse.json(
        { error: 'O telefone deve ser um celular válido de Curitiba com DDD 41 (ex: 41 9XXXX-XXXX).' },
        { status: 400 }
      )
    }

    // 4. Impor rate limit de 60 segundos por telefone
    const supabaseAdmin = createAdminClient()

    const umMinutoAtras = new Date(Date.now() - 60 * 1000).toISOString()
    const { data: codigosRecentes, error: rateLimitError } = await supabaseAdmin
      .from('codigos_verificacao')
      .select('data_criacao')
      .eq('telefone', sanitized)
      .gt('data_criacao', umMinutoAtras)
      .order('data_criacao', { ascending: false })
      .limit(1)

    if (rateLimitError) {
      console.error('Erro ao verificar limite de envio:', rateLimitError)
      return NextResponse.json(
        { error: 'Erro interno ao processar a requisição.' },
        { status: 500 }
      )
    }

    if (codigosRecentes && codigosRecentes.length > 0) {
      return NextResponse.json(
        { error: 'Aguarde 60 segundos antes de solicitar um novo código.' },
        { status: 429 }
      )
    }

    // 5. Gerar OTP de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString()
    const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // 6. Persistir no banco de dados usando o admin client
    const { error: insertError } = await supabaseAdmin
      .from('codigos_verificacao')
      .insert({
        usuario_id: user.id,
        telefone: sanitized,
        codigo: codigo,
        expira_em: expiraEm,
        verificado: false,
      })

    if (insertError) {
      console.error('Erro ao salvar código de verificação:', insertError)
      return NextResponse.json(
        { error: 'Erro ao gerar o código de verificação no banco de dados.' },
        { status: 500 }
      )
    }

    // 7. Detectar canais disponíveis para este telefone
    const canais = await detectarCanaisDisponiveis(supabaseAdmin, sanitized)
    let canalUsado = canais.canal
    let envioSucesso = false
    const erros: string[] = []

    // 7a. Enviar via Telegram — canal mais confiável, tenta primeiro se disponível
    if (canais.telegram) {
      const resultTelegram = await enviarOtpTelegram(canais.telegram, codigo)
      if (resultTelegram.success) {
        console.log(`[OTP] Código enviado via Telegram para chat_id ${canais.telegram}`)
        envioSucesso = true
        canalUsado = 'telegram'
      } else {
        console.warn('[OTP] Falha ao enviar via Telegram:', resultTelegram.error)
        erros.push(`Telegram: ${resultTelegram.error}`)
      }
    }

    // 7b. Enviar via WhatsApp — só tenta se Telegram não conseguiu ou não está disponível
    if (!envioSucesso && canais.whatsapp) {
      const whatsappToken = process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN
      const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

      if (whatsappToken && whatsappPhoneId) {
        try {
          const response = await fetch(
            `https://graph.facebook.com/v20.0/${whatsappPhoneId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${whatsappToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: sanitized,
                type: 'template',
                template: {
                  name: 'otp_verification',
                  language: { code: 'pt_BR' },
                  components: [
                    {
                      type: 'body',
                      parameters: [{ type: 'text', text: codigo }],
                    },
                  ],
                },
              }),
            }
          )

          if (response.ok) {
            envioSucesso = true
            canalUsado = 'whatsapp'
            console.log(`[OTP] Código enviado via WhatsApp para ${sanitized}`)
          } else {
            const errorData = await response.json().catch(() => ({}))
            console.error('Erro na resposta da Meta WhatsApp API:', errorData)
            erros.push(`WhatsApp: ${JSON.stringify(errorData)}`)
          }
        } catch (err: any) {
          console.error('Erro de conexão ao enviar WhatsApp API:', err)
          erros.push(`WhatsApp: ${err.message}`)
        }
      } else {
        // Modo desenvolvimento: mock no terminal
        const maskedPhone = sanitized.length >= 8
          ? sanitized.slice(0, 4) + '*****' + sanitized.slice(-4)
          : '***********'
        console.log(`\n--- [MOCK WHATSAPP OTP] ---`)
        console.log(`Para: +${maskedPhone}`)
        console.log(`Código OTP gerado: ${codigo}`)
        console.log(`Expiração: ${expiraEm}`)
        console.log(`---------------------------\n`)
        envioSucesso = true
        canalUsado = 'whatsapp'
      }
    }

    if (!envioSucesso) {
      const detalhes = erros.length > 0 ? ` Detalhes: ${erros.join(' | ')}` : ''
      return NextResponse.json(
        { error: `Falha ao enviar o código de verificação.${detalhes}` },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Código enviado com sucesso.',
      canal: canalUsado
    })
  } catch (error) {
    console.error('Erro não tratado no handler POST /api/auth/otp:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
