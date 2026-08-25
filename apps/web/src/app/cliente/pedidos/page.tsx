import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionListarMeusPedidosCliente } from '@/app/actions/pedidos'
import ClienteOrdersDashboard from '@/components/cliente/ClienteOrdersDashboard'

export const dynamic = 'force-dynamic'

export default async function ClientePedidosPage() {
  const supabase = await createClient()

  // 1. Validar autenticação do usuário
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 2. Buscar cliente vinculado ao usuário
  const admin = createAdminClient()
  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .select('id, nome, telefone')
    .eq('usuario_id', user.id)
    .single()

  if (clienteError || !cliente) {
    redirect('/cliente/verificar-telefone')
  }

  // 3. Pré-carregar pedidos no SSR
  const pedidosRes = await actionListarMeusPedidosCliente()
  const pedidosIniciais = pedidosRes.success && pedidosRes.data ? pedidosRes.data : []

  return (
    <ClienteOrdersDashboard
      clienteId={cliente.id}
      pedidosIniciais={pedidosIniciais as any}
    />
  )
}
