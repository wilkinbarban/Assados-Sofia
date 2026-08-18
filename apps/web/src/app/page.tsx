import { redirect } from 'next/navigation'
import { getRoleRedirectPath } from '@/lib/auth/safe-redirect'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()

  if (!profile?.ativo) {
    redirect('/login')
  }

  if (['admin', 'supervisor', 'vendedor'].includes(profile.funcao)) {
    redirect(getRoleRedirectPath(profile.funcao))
  }

  const { data: client } = await supabase
    .from('clientes')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle()

  redirect(getRoleRedirectPath(profile.funcao, Boolean(client)))
}
