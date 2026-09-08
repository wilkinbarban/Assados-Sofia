import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPath = searchParams.get('path')
    const wantsPreview = searchParams.get('preview') === 'true' || searchParams.get('format') === 'png'

    if (!rawPath) {
      return NextResponse.json({ error: 'Caminho do arquivo não fornecido' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('perfis').select('funcao,ativo').eq('id', user.id).single()
    if (profile && profile.funcao !== 'cliente' && !profile.ativo) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    }

    // Limpar o caminho se for uma URL completa
    let storagePath = rawPath
    if (storagePath.includes('chat-midias/')) {
      storagePath = storagePath.split('chat-midias/')[1].split('?')[0]
    }
    storagePath = decodeURIComponent(storagePath).replace(/^\/+/, '')
    if (!storagePath || storagePath.includes('..') || /[\0\r\n]/.test(storagePath)) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    }

    const isStaff = Boolean(profile?.ativo && ['admin', 'supervisor', 'vendedor'].includes(profile.funcao))

    let authorized = isStaff
    if (!authorized) {
      const { data: cliente } = await admin
        .from('clientes').select('id').eq('usuario_id', user.id).single()
      if (cliente) {
        const basePath = storagePath.replace(/_preview\.(png|jpg|webp)$/i, '.pdf')
        const { data: ownConversations } = await admin
          .from('conversas').select('id').eq('cliente_id', cliente.id)
        const ownConversationIds = ownConversations?.map((conversation) => conversation.id) ?? []
        if (ownConversationIds.length > 0) {
          const { data: msg } = await admin
            .from('mensagens').select('id').in('conversa_id', ownConversationIds).or(`url_anexo.eq.${storagePath},url_anexo.eq.${basePath}`).limit(1)
          if (msg?.length) authorized = true
        }
        if (!authorized) {
          const { data: receipts } = await admin
            .from('comprovantes').select('id').eq('cliente_id', cliente.id).or(`url_arquivo.eq.${storagePath},url_arquivo.eq.${basePath}`).limit(1)
          authorized = Boolean(receipts?.length)
        }
      }
    }
    if (!authorized) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    }

    const fileName = storagePath.split('/').pop() || 'comprovante'
    const lowerName = fileName.toLowerCase()

    // Se o cliente solicitou a prévia em PNG de um PDF
    if (wantsPreview && lowerName.endsWith('.pdf')) {
      const previewPath = storagePath.replace(/\.pdf$/i, '_preview.png')
      const { data: previewBlob } = await admin.storage
        .from('chat-midias')
        .download(previewPath)

      if (previewBlob) {
        const previewBuffer = await previewBlob.arrayBuffer()
        return new Response(previewBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `inline; filename="${fileName.replace(/\.pdf$/i, '.png')}"`,
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }

      // Se a prévia ainda não foi gravada no storage, rasteriza sob demanda
      const { data: originalBlob } = await admin.storage
        .from('chat-midias')
        .download(storagePath)

      if (originalBlob) {
        try {
          const { renderPaymentProofPageOne } = await import('@/lib/payment-proofs/render-png')
          const pdfBytes = new Uint8Array(await originalBlob.arrayBuffer())
          const render = await renderPaymentProofPageOne(pdfBytes)

          // Salva no storage de forma assíncrona para cache
          void admin.storage
            .from('chat-midias')
            .upload(previewPath, render.png, { contentType: 'image/png', upsert: true })

          return new Response(Buffer.from(render.png), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Content-Disposition': `inline; filename="${fileName.replace(/\.pdf$/i, '.png')}"`,
              'Cache-Control': 'private, max-age=3600',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        } catch (rErr) {
          console.warn('[API /api/chat/midia] Falha ao rasterizar preview on-demand:', rErr)
        }
      }
    }

    const { data: fileBlob, error: downloadError } = await admin.storage
      .from('chat-midias')
      .download(storagePath)

    if (downloadError || !fileBlob) {
      console.error('[API /api/chat/midia] Erro ao baixar arquivo:', downloadError, storagePath)
      return NextResponse.json(
        { error: 'Arquivo não encontrado ou inacessível no storage' },
        { status: 404 }
      )
    }

    const arrayBuffer = await fileBlob.arrayBuffer()

    let contentType = fileBlob.type || 'application/octet-stream'
    if (lowerName.endsWith('.pdf')) {
      contentType = 'application/pdf'
    } else if (lowerName.endsWith('.png')) {
      contentType = 'image/png'
    } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      contentType = 'image/jpeg'
    } else if (lowerName.endsWith('.webp')) {
      contentType = 'image/webp'
    }

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: any) {
    console.error('[API /api/chat/midia] Exceção inesperada:', error)
    return NextResponse.json({ error: 'Erro interno ao processar mídia' }, { status: 500 })
  }
}
