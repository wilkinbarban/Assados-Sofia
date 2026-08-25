import { createClient } from '@/lib/supabase/server'
import { buildReceiptSvg, type ReceiptSnapshot } from '@/lib/receipts/salesReceipt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase.from('perfis').select('funcao, ativo').eq('id', user.id).single()
  const isOperator = profile?.ativo && ['admin', 'supervisor', 'vendedor'].includes(profile.funcao)
  const isClient = profile?.ativo && profile.funcao === 'cliente'

  if (!isOperator && !isClient) {
    return new Response('Forbidden', { status: 403 })
  }

  // Permite buscar tanto pelo ID do comprovante quanto pelo ID do pedido
  let { data: receipt } = await supabase
    .from('comprovantes_venda')
    .select('snapshot')
    .eq('id', id)
    .single()

  if (!receipt?.snapshot) {
    const resPedido = await supabase
      .from('comprovantes_venda')
      .select('snapshot')
      .eq('pedido_id', id)
      .single()
    if (resPedido?.data?.snapshot) {
      receipt = resPedido.data
    }
  }

  if (!receipt?.snapshot) return new Response('Not found', { status: 404 })

  const isSegundaVia = isClient || new URL(_request.url).searchParams.get('via') === 'cliente'
  const svgContent = buildReceiptSvg(receipt.snapshot as ReceiptSnapshot, { isSegundaVia })

  return new Response(svgContent, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `inline; filename="comprovante-${isSegundaVia ? '2via-' : ''}${id}.svg"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
