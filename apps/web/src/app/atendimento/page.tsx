import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import OperatorInboxContainer from '@/components/operator/OperatorInboxContainer'
import { OperatorLogoutButton } from '@/components/operator/OperatorLogoutButton'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { obterStatusSofiaAtendimento } from '@/app/actions/atendimento'
import type { SofiaAtendimentoStatus } from '@/app/actions/atendimento'
import type { Cliente, Conversa, Mensagem } from '@/components/operator/ConversationsQueue'

export const dynamic = 'force-dynamic'

export default async function AtendimentoPage() {
  const supabase = await createClient()

  // 1. Verificar sessão do usuário ativo
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 2. Buscar perfil e validar papel de operador e se está ativo
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil || !perfil.ativo) {
    redirect('/login')
  }

  const funcoesAutorizadas = ['admin', 'supervisor', 'vendedor']
  if (!funcoesAutorizadas.includes(perfil.funcao)) {
    redirect('/login')
  }

  // 3. Pré-carregamento (SSR) das primeiras 50 conversas ativas (status != 'fechada').
  // Inclui dados de CRM e histórico para que o console não dependa da hidratação
  // do cliente para deixar de parecer vazio/quebrado no primeiro carregamento.
  const { data: conversas, error: conversasError } = await supabase
    .from('conversas')
    .select(`
      id,
      cliente_id,
      status,
      ia_ativa,
      data_criacao,
      data_atualizacao,
      clientes (
        id,
        nome,
        telefone,
        endereco,
        tags,
        notas,
        score
      ),
      mensagens (
        id,
        conversa_id,
        remetente,
        conteudo,
        url_anexo,
        data_criacao
      )
    `)
    .neq('status', 'fechada')
    .order('data_atualizacao', { ascending: false })
    .limit(50)

  if (conversasError) {
    console.error('Erro ao pré-carregar conversas no SSR:', conversasError)
  }

  const clienteIds = Array.from(
    new Set(((conversas || []) as AtendimentoConversaRecord[]).map((conversa) => conversa.cliente_id))
  )

  const { data: sofiaStates, error: sofiaStatesError } = clienteIds.length > 0
    ? await supabase
        .from('whatsapp_sofia_states')
        .select('id, cliente_id, canal, sofia_dormindo, motivo, origem, alterado_por, data_criacao, data_atualizacao')
        .in('cliente_id', clienteIds)
        .eq('canal', 'whatsapp')
    : { data: [], error: null }

  if (sofiaStatesError) {
    console.error('Erro ao pré-carregar estado WhatsApp Sofia no SSR:', sofiaStatesError)
  }

  const sofiaStateByClienteId = new Map(
    ((sofiaStates || []) as WhatsAppSofiaStateRecord[]).map((state) => [state.cliente_id, mapWhatsAppSofiaState(state)])
  )

  const sofiaStatusResult = await obterStatusSofiaAtendimento()
  const initialSofiaStatus: SofiaAtendimentoStatus | null = sofiaStatusResult.success && sofiaStatusResult.data
    ? sofiaStatusResult.data
    : null
  if (!sofiaStatusResult.success) {
    console.error('Erro ao pré-carregar status global da Sofia:', sofiaStatusResult.error)
  }

  // Sanitização de segurança das conversas para garantir integridade estrutural
  const conversasIniciais = ((conversas || []) as AtendimentoConversaRecord[]).map((conversa) => {
    const cliente = Array.isArray(conversa.clientes) ? conversa.clientes[0] : conversa.clientes
    const mensagens = [...(conversa.mensagens || [])].sort(
      (a, b) => new Date(a.data_criacao).getTime() - new Date(b.data_criacao).getTime()
    )

    return {
      ...conversa,
      clientes: cliente || {
        id: conversa.cliente_id,
        nome: 'Cliente Sem Nome',
        telefone: '',
        endereco: null,
        tags: [],
        notas: null,
        score: 0
      },
      mensagens,
      whatsapp_sofia_state: sofiaStateByClienteId.get(conversa.cliente_id) ?? null
    } satisfies Conversa
  })

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-50 overflow-hidden font-sans">
      {/* Cabeçalho do Operador */}
      <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <BrandLogo size="md" href="/atendimento" />
          
          <div className="hidden md:flex items-center gap-1 border-l border-zinc-800 pl-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-500/90 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
              Console de Atendimento
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {['admin', 'supervisor'].includes(perfil.funcao) && (
            <Link
              href="/atendimento/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 rounded-lg text-xs font-bold shadow-md shadow-amber-500/10 transition-all cursor-pointer select-none active:scale-95"
            >
              <span>Painel Administrativo</span>
            </Link>
          )}

          <Link
            href="/atendimento/pedidos"
            className="inline-flex items-center px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-800 transition-all cursor-pointer select-none"
          >
            Pedidos
          </Link>

          <Link
            href="/atendimento/produtos"
            className="hidden sm:inline-flex items-center px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-800 transition-all cursor-pointer select-none"
          >
            Estoque
          </Link>

          <Link
            href="/atendimento/conhecimento"
            className="hidden sm:inline-flex items-center px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-800 transition-all cursor-pointer select-none"
          >
            Base RAG
          </Link>

          <Link
            href="/atendimento/perfil"
            className="px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-800 transition-all cursor-pointer select-none"
          >
            Meu Perfil
          </Link>

          <OperatorLogoutButton />

          <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs text-zinc-300 font-medium capitalize">
              {perfil.funcao === 'admin' ? 'Administrador' : perfil.funcao === 'supervisor' ? 'Supervisor' : 'Atendente'}
            </span>
          </div>
        </div>
      </header>

      {/* Área de Trabalho */}
      <main className="flex-1 overflow-hidden">
        <OperatorInboxContainer conversasIniciais={conversasIniciais} initialSofiaStatus={initialSofiaStatus} />
      </main>
    </div>
  )
}


type AtendimentoConversaRecord = Omit<Conversa, 'clientes' | 'mensagens'> & {
  clientes: Cliente | Cliente[] | null
  mensagens: Mensagem[] | null
}


type WhatsAppSofiaStateRecord = {
  id: string
  cliente_id: string
  canal: 'whatsapp'
  sofia_dormindo: boolean
  motivo: 'manual' | 'handoff_phrase' | null
  origem: 'operator' | 'meta_webhook' | 'evolution_webhook' | null
  alterado_por: string | null
  data_criacao: string
  data_atualizacao: string
}

function mapWhatsAppSofiaState(state: WhatsAppSofiaStateRecord) {
  return {
    id: state.id,
    cliente_id: state.cliente_id,
    canal: state.canal,
    sofia_dormindo: state.sofia_dormindo,
    motivo: state.motivo,
    origem: state.origem,
    alterado_por: state.alterado_por,
    data_criacao: state.data_criacao,
    data_atualizacao: state.data_atualizacao,
  }
}
