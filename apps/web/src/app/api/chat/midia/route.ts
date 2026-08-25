import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPath = searchParams.get('path')

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

    // Limpar o caminho se for uma URL completa
    let storagePath = rawPath
    if (storagePath.includes('chat-midias/')) {
      storagePath = storagePath.split('chat-midias/')[1].split('?')[0]
    }
    storagePath = decodeURIComponent(storagePath).replace(/^\/+/, '')

    const admin = createAdminClient()
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
    const fileName = storagePath.split('/').pop() || 'comprovante'
    const lowerName = fileName.toLowerCase()

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
