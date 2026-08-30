import { GET as getSvg } from '../svg/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return getSvg(request, context)
}
