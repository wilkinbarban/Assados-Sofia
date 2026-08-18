import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { actionListarPedidos } from '@/app/actions/pedidos'
import OrdersManagementDashboard from '@/components/operator/OrdersManagementDashboard'

export const dynamic = 'force-dynamic'

export default async function PedidosPage() {
  const supabase = await createClient()

  // 1. Verificar sessão do usuário autenticado
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 2. Buscar perfil do usuário e validar permissões de operador
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('id, nome, funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil || !perfil.ativo) {
    redirect('/login')
  }

  const allowedRoles = ['admin', 'supervisor', 'vendedor']
  if (!allowedRoles.includes(perfil.funcao)) {
    redirect('/login')
  }

  // 3. Pré-carregar pedidos no SSR
  const pedidosRes = await actionListarPedidos({ limite: 150 })
  const pedidosIniciais = pedidosRes.success && pedidosRes.data ? pedidosRes.data : []

  return (
    <OrdersManagementDashboard
      usuarioLogado={{
        id: perfil.id,
        nome: perfil.nome,
        funcao: perfil.funcao,
      }}
      pedidosIniciais={pedidosIniciais as any}
    />
  )
}
