'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  DollarSign,
  QrCode,
  ExternalLink,
  MessageSquare,
  Filter,
  TrendingUp,
  ShoppingBag,
  User,
  Phone,
  Calendar,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
  CreditCard,
  Truck,
  RotateCcw,
  ArrowUpDown,
} from 'lucide-react'
import Link from 'next/link'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { OperatorLogoutButton } from '@/components/operator/OperatorLogoutButton'
import {
  actionListarPedidos,
  actionAtualizarStatusPedido,
  actionAtualizarStatusPagamento,
  gerarPreferenciaPagamento,
} from '@/app/actions/pedidos'

interface PedidoItem {
  id: string
  quantidade: number
  preco_unitario_centavos: number
  preco_total_centavos: number
  produtos?: any
}

interface ClienteData {
  id: string
  nome: string
  telefone: string
  email?: string | null
}

interface Pedido {
  id: string
  status: 'novo' | 'confirmado' | 'entregue' | 'cancelado'
  tipo_entrega: 'entrega' | 'retirada'
  endereco_entrega?: string | null
  taxa_entrega_centavos: number
  total_produtos_centavos: number
  total_pedido_centavos: number
  status_pagamento: 'pendente' | 'aprovado' | 'rejeitado' | 'reembolsado'
  meio_pagamento: 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'
  mercado_pago_preferencia_id?: string | null
  data_criacao: string
  data_atualizacao: string
  cliente_id: string
  conversa_id?: string | null
  clientes?: ClienteData | ClienteData[] | null
  itens?: PedidoItem[]
}

interface OrdersManagementDashboardProps {
  usuarioLogado: {
    id: string
    nome: string
    funcao: string
  }
  pedidosIniciais?: Pedido[]
}

function formatarMoeda(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatarData(dataIso: string): string {
  try {
    const d = new Date(dataIso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dataIso
  }
}

function formatarTelefone(tel: string): string {
  if (tel.startsWith('55') && tel.length === 13) {
    return `+55 (${tel.substring(2, 4)}) ${tel.substring(4, 9)}-${tel.substring(9)}`
  }
  return tel
}

export default function OrdersManagementDashboard({
  usuarioLogado,
  pedidosIniciais = [],
}: OrdersManagementDashboardProps) {
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciais)
  const [loading, setLoading] = useState(pedidosIniciais.length === 0)
  const [refreshing, setRefreshing] = useState(false)

  // Filtros
  const [statusFilter, setStatusFilter] = useState<'todos' | 'novo' | 'confirmado' | 'entregue' | 'cancelado'>('todos')
  const [pagamentoFilter, setPagamentoFilter] = useState<'todos' | 'pendente' | 'aprovado' | 'rejeitado' | 'reembolsado'>('todos')
  const [entregaFilter, setEntregaFilter] = useState<'todos' | 'entrega' | 'retirada'>('todos')
  const [meioPagamentoFilter, setMeioPagamentoFilter] = useState<'todos' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'>('todos')
  const [periodoFilter, setPeriodoFilter] = useState<'todos' | 'hoje' | 'ultimos_7_dias' | 'este_mes'>('todos')
  const [ordenacao, setOrdenacao] = useState<'recente' | 'antigo' | 'maior_valor' | 'menor_valor'>('recente')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const carregarPedidos = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setErrorMsg(null)

    try {
      const res = await actionListarPedidos({ limite: 150 })
      if (res.success && res.data) {
        setPedidos(res.data as unknown as Pedido[])
      } else {
        setErrorMsg((res as any).error || 'Erro ao carregar lista de pedidos.')
      }
    } catch (err: any) {
      console.error('Erro ao listar pedidos:', err)
      setErrorMsg('Erro inesperado ao consultar pedidos.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (pedidosIniciais.length === 0) {
      carregarPedidos()
    }
  }, [carregarPedidos, pedidosIniciais.length])

  // KPIs
  const metrics = useMemo(() => {
    const total = pedidos.length
    const novos = pedidos.filter((p) => p.status === 'novo').length
    const confirmados = pedidos.filter((p) => p.status === 'confirmado').length
    const entregues = pedidos.filter((p) => p.status === 'entregue').length
    const cancelados = pedidos.filter((p) => p.status === 'cancelado').length
    const faturamentoCentavos = pedidos
      .filter((p) => p.status !== 'cancelado')
      .reduce((acc, p) => acc + (p.total_pedido_centavos || 0), 0)

    return {
      total,
      novos,
      confirmados,
      entregues,
      cancelados,
      faturamentoCentavos,
    }
  }, [pedidos])

  // Quantidade de filtros ativos além do padrão
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (pagamentoFilter !== 'todos') count++
    if (entregaFilter !== 'todos') count++
    if (meioPagamentoFilter !== 'todos') count++
    if (periodoFilter !== 'todos') count++
    if (ordenacao !== 'recente') count++
    return count
  }, [pagamentoFilter, entregaFilter, meioPagamentoFilter, periodoFilter, ordenacao])

  const hasAnyFilterActive = useMemo(() => {
    return (
      statusFilter !== 'todos' ||
      pagamentoFilter !== 'todos' ||
      entregaFilter !== 'todos' ||
      meioPagamentoFilter !== 'todos' ||
      periodoFilter !== 'todos' ||
      ordenacao !== 'recente' ||
      searchQuery.trim().length > 0
    )
  }, [statusFilter, pagamentoFilter, entregaFilter, meioPagamentoFilter, periodoFilter, ordenacao, searchQuery])

  const handleLimparFiltros = () => {
    setStatusFilter('todos')
    setPagamentoFilter('todos')
    setEntregaFilter('todos')
    setMeioPagamentoFilter('todos')
    setPeriodoFilter('todos')
    setOrdenacao('recente')
    setSearchQuery('')
  }

  // Filtros e Ordenação Abrangente
  const pedidosFiltrados = useMemo(() => {
    const now = Date.now()
    const hojeInicio = new Date()
    hojeInicio.setHours(0, 0, 0, 0)
    const seteDiasAtras = now - 7 * 24 * 60 * 60 * 1000
    const primeiroDiaMes = new Date()
    primeiroDiaMes.setDate(1)
    primeiroDiaMes.setHours(0, 0, 0, 0)

    const filtrados = pedidos.filter((pedido) => {
      // 1. Filtro de Status
      if (statusFilter !== 'todos') {
        if (pedido.status !== statusFilter) {
          return false
        }
      }

      // 2. Filtro de Status de Pagamento
      if (pagamentoFilter !== 'todos') {
        if (pedido.status_pagamento !== pagamentoFilter) {
          return false
        }
      }

      // 3. Filtro de Tipo de Entrega
      if (entregaFilter !== 'todos') {
        if (pedido.tipo_entrega !== entregaFilter) {
          return false
        }
      }

      // 4. Filtro de Meio de Pagamento
      if (meioPagamentoFilter !== 'todos') {
        if (pedido.meio_pagamento !== meioPagamentoFilter) {
          return false
        }
      }

      // 5. Filtro de Período
      if (periodoFilter !== 'todos') {
        const dataPedido = new Date(pedido.data_criacao).getTime()
        if (periodoFilter === 'hoje' && dataPedido < hojeInicio.getTime()) {
          return false
        }
        if (periodoFilter === 'ultimos_7_dias' && dataPedido < seteDiasAtras) {
          return false
        }
        if (periodoFilter === 'este_mes' && dataPedido < primeiroDiaMes.getTime()) {
          return false
        }
      }

      // 6. Busca Multicampos (Nome, Telefone, ID, Endereço, Nome dos Itens)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const clienteObj = Array.isArray(pedido.clientes) ? pedido.clientes[0] : pedido.clientes
        const clienteNome = (clienteObj?.nome || '').toLowerCase()
        const clienteTel = (clienteObj?.telefone || '').replace(/\D/g, '')
        const queryDigits = query.replace(/\D/g, '')
        const pedidoId = pedido.id.toLowerCase()
        const endereco = (pedido.endereco_entrega || '').toLowerCase()
        
        // Produtos no pedido
        const nomesProdutos = (pedido.itens || [])
          .map((i) => (i.produtos?.nome || '').toLowerCase())
          .join(' ')

        const matchNome = clienteNome.includes(query)
        const matchTel = queryDigits.length >= 3 ? clienteTel.includes(queryDigits) : (clienteObj?.telefone || '').includes(query)
        const matchId = pedidoId.includes(query)
        const matchEndereco = endereco.includes(query)
        const matchProdutos = nomesProdutos.includes(query)

        if (!matchNome && !matchTel && !matchId && !matchEndereco && !matchProdutos) {
          return false
        }
      }

      return true
    })

    // Ordenação
    return filtrados.sort((a, b) => {
      if (ordenacao === 'antigo') {
        return new Date(a.data_criacao).getTime() - new Date(b.data_criacao).getTime()
      }
      if (ordenacao === 'maior_valor') {
        return (b.total_pedido_centavos || 0) - (a.total_pedido_centavos || 0)
      }
      if (ordenacao === 'menor_valor') {
        return (a.total_pedido_centavos || 0) - (b.total_pedido_centavos || 0)
      }
      // 'recente' padrão
      return new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime()
    })
  }, [pedidos, statusFilter, pagamentoFilter, entregaFilter, meioPagamentoFilter, periodoFilter, ordenacao, searchQuery])

  const handleMarcarEntregue = async (pedidoId: string) => {
    setActionLoadingId(pedidoId)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await actionAtualizarStatusPedido({
        pedidoId,
        novoStatus: 'entregue',
      })

      if (res.success) {
        setSuccessMsg('Pedido marcado como Entregue com sucesso!')
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg((res as any).error || 'Erro ao atualizar pedido.')
      }
    } catch (err: any) {
      console.error('Erro ao marcar entregue:', err)
      setErrorMsg('Erro inesperado ao atualizar status.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleMarcarConfirmado = async (pedidoId: string) => {
    setActionLoadingId(pedidoId)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await actionAtualizarStatusPedido({
        pedidoId,
        novoStatus: 'confirmado',
      })

      if (res.success) {
        setSuccessMsg('Pedido confirmado para preparo!')
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg((res as any).error || 'Erro ao confirmar pedido.')
      }
    } catch (err: any) {
      console.error('Erro ao confirmar pedido:', err)
      setErrorMsg('Erro inesperado ao confirmar status.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleMarcarCancelado = async (pedidoId: string) => {
    if (!window.confirm('Tem certeza que deseja cancelar este pedido?')) {
      return
    }

    setActionLoadingId(pedidoId)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await actionAtualizarStatusPedido({
        pedidoId,
        novoStatus: 'cancelado',
      })

      if (res.success) {
        setSuccessMsg('Pedido cancelado com sucesso.')
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg((res as any).error || 'Erro ao cancelar pedido.')
      }
    } catch (err: any) {
      console.error('Erro ao cancelar pedido:', err)
      setErrorMsg('Erro inesperado ao cancelar status.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleAtualizarPagamento = async (pedidoId: string, novoStatus: 'aprovado' | 'pendente' | 'rejeitado') => {
    setActionLoadingId(pedidoId)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await actionAtualizarStatusPagamento({
        pedidoId,
        statusPagamento: novoStatus,
      })

      if (res.success) {
        setSuccessMsg(`Status de pagamento atualizado para: ${novoStatus.toUpperCase()}`)
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg((res as any).error || 'Erro ao atualizar pagamento.')
      }
    } catch (err: any) {
      console.error('Erro ao atualizar pagamento:', err)
      setErrorMsg('Erro inesperado ao atualizar status de pagamento.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleAprovarPagamento = async (pedidoId: string) => {
    return handleAtualizarPagamento(pedidoId, 'aprovado')
  }

  const handleCancelarPedido = async (pedidoId: string) => {
    return handleMarcarCancelado(pedidoId)
  }

  const handleGerarLinkPagamento = async (pedidoId: string) => {
    setActionLoadingId(pedidoId)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await gerarPreferenciaPagamento(pedidoId)
      if (res.success && res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer')
        setSuccessMsg('Link de pagamento aberto em nova aba!')
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg((res as any).error || 'Não foi possível gerar preferência de pagamento.')
      }
    } catch (err: any) {
      console.error('Erro ao gerar pagamento MP:', err)
      setErrorMsg('Erro ao processar pagamento.')
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 font-sans">
      {/* Header de Navegação Superior */}
      <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 shrink-0 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <BrandLogo size="md" href="/atendimento" />

          <div className="hidden md:flex items-center gap-2 border-l border-zinc-800 pl-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-500/90 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Gestão de Pedidos
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/atendimento"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-800 transition-all cursor-pointer select-none"
          >
            <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
            <span>Console Atendimento</span>
          </Link>

          {['admin', 'supervisor'].includes(usuarioLogado.funcao) && (
            <Link
              href="/atendimento/admin"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 rounded-lg text-xs font-bold shadow-md shadow-amber-500/10 transition-all cursor-pointer select-none"
            >
              <span>Painel Admin</span>
            </Link>
          )}

          <Link
            href="/atendimento/produtos"
            className="hidden md:inline-flex items-center px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-800 transition-all cursor-pointer select-none"
          >
            Estoque
          </Link>

          <Link
            href="/atendimento/perfil"
            className="hidden md:inline-flex items-center px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-800 transition-all cursor-pointer select-none"
          >
            Meu Perfil
          </Link>

          <OperatorLogoutButton />

          <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs text-zinc-300 font-medium capitalize hidden sm:inline">
              {usuarioLogado.funcao === 'admin'
                ? 'Administrador'
                : usuarioLogado.funcao === 'supervisor'
                ? 'Supervisor'
                : 'Atendente'}
            </span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Alertas */}
        {errorMsg && (
          <div className="flex items-center gap-3 rounded-xl bg-red-950/40 border border-red-900/50 p-4 text-sm text-red-200 shadow-md">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50 p-4 text-sm text-emerald-200 shadow-md">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            <span className="flex-1">{successMsg}</span>
          </div>
        )}

        {/* Métricas e KPIs do Domingo de Assados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total de Pedidos</p>
              <p className="text-2xl font-black font-mono text-zinc-100 mt-1">{metrics.total}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Em Preparo / Novos</p>
              <p className="text-2xl font-black font-mono text-blue-400 mt-1">{metrics.novos + metrics.confirmados}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Entregues / Concluídos</p>
              <p className="text-2xl font-black font-mono text-emerald-400 mt-1">{metrics.entregues}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Faturamento Real</p>
              <p className="text-2xl font-black font-mono text-amber-400 mt-1">{formatarMoeda(metrics.faturamentoCentavos)}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Barra de Filtros, Busca e Ações */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3.5">
          {/* Linha Superior: Abas de Status, Busca e Botões */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5">
            {/* Abas de Status */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setStatusFilter('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                  statusFilter === 'todos'
                    ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/10'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                Todos ({metrics.total})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('novo')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                  statusFilter === 'novo'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                Novos ({metrics.novos})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('confirmado')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                  statusFilter === 'confirmado'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                Confirmados ({metrics.confirmados})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('entregue')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                  statusFilter === 'entregue'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                Entregues ({metrics.entregues})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('cancelado')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                  statusFilter === 'cancelado'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                Cancelados ({metrics.cancelados})
              </button>
            </div>

            {/* Campo de Busca Multicampos + Filtros Avançados + Atualizar */}
            <div className="flex items-center gap-2.5 flex-1 lg:flex-none lg:justify-end">
              <div className="relative flex-1 lg:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cliente, fone, #PED, item..."
                  className="w-full pl-9 pr-8 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Botão de Filtros Avançados */}
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-semibold transition-all cursor-pointer select-none ${
                  showAdvancedFilters || activeFiltersCount > 0
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filtros</span>
                {activeFiltersCount > 0 && (
                  <span className="h-4 w-4 rounded-full bg-amber-500 text-zinc-950 font-black text-[10px] flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Botão de Atualizar */}
              <button
                type="button"
                disabled={refreshing}
                onClick={() => carregarPedidos(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-zinc-100 transition-all cursor-pointer select-none"
                title="Atualizar lista de pedidos"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-amber-500' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
            </div>
          </div>

          {/* Painel Expansível de Filtros Avançados */}
          {showAdvancedFilters && (
            <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Filtro: Status do Pagamento */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5 flex items-center gap-1">
                  <CreditCard className="h-3 w-3 text-amber-500" />
                  <span>Pagamento</span>
                </label>
                <select
                  value={pagamentoFilter}
                  onChange={(e) => setPagamentoFilter(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="todos">Todos os pagamentos</option>
                  <option value="pendente">⏳ Pendente (Aguardando)</option>
                  <option value="aprovado">✅ Pago & Aprovado</option>
                  <option value="rejeitado">❌ Rejeitado</option>
                  <option value="reembolsado">↩️ Reembolsado</option>
                </select>
              </div>

              {/* Filtro: Tipo de Entrega */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5 flex items-center gap-1">
                  <Truck className="h-3 w-3 text-amber-500" />
                  <span>Tipo Entrega</span>
                </label>
                <select
                  value={entregaFilter}
                  onChange={(e) => setEntregaFilter(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="todos">Todas as modalidades</option>
                  <option value="entrega">🛵 Delivery (Entrega)</option>
                  <option value="retirada">🏪 Retirada no Balcão</option>
                </select>
              </div>

              {/* Filtro: Meio de Pagamento */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5 flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-amber-500" />
                  <span>Forma de Pagamento</span>
                </label>
                <select
                  value={meioPagamentoFilter}
                  onChange={(e) => setMeioPagamentoFilter(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="todos">Todas as formas</option>
                  <option value="pix">⚡ Pix</option>
                  <option value="cartao_credito">💳 Cartão de Crédito</option>
                  <option value="cartao_debito">💳 Cartão de Débito</option>
                  <option value="dinheiro">💵 Dinheiro</option>
                </select>
              </div>

              {/* Filtro: Período */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-amber-500" />
                  <span>Período</span>
                </label>
                <select
                  value={periodoFilter}
                  onChange={(e) => setPeriodoFilter(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="todos">Todos os registros</option>
                  <option value="hoje">☀️ Hoje (Domingo)</option>
                  <option value="ultimos_7_dias">📅 Últimos 7 dias</option>
                  <option value="este_mes">🗓️ Este mês</option>
                </select>
              </div>

              {/* Filtro: Ordenação */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5 flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3 text-amber-500" />
                  <span>Ordenar Por</span>
                </label>
                <select
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="recente">🕒 Mais recente primeiro</option>
                  <option value="antigo">⏰ Mais antigo primeiro</option>
                  <option value="maior_valor">💰 Maior valor total</option>
                  <option value="menor_valor">🏷️ Menor valor total</option>
                </select>
              </div>
            </div>
          )}

          {/* Faixa de Resumo e Chips de Filtros Ativos */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/40 text-xs">
            <div className="flex items-center gap-2 text-zinc-400">
              <span>
                Exibindo <strong className="text-amber-400 font-mono">{pedidosFiltrados.length}</strong> de{' '}
                <strong className="text-zinc-200 font-mono">{pedidos.length}</strong> pedidos
              </span>
            </div>

            {hasAnyFilterActive && (
              <div className="flex flex-wrap items-center gap-1.5">
                {pagamentoFilter !== 'todos' && (
                  <span className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded-md border border-zinc-700">
                    Pagamento: {pagamentoFilter}
                    <button type="button" onClick={() => setPagamentoFilter('todos')} className="hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {entregaFilter !== 'todos' && (
                  <span className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded-md border border-zinc-700">
                    Entrega: {entregaFilter}
                    <button type="button" onClick={() => setEntregaFilter('todos')} className="hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {meioPagamentoFilter !== 'todos' && (
                  <span className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded-md border border-zinc-700">
                    Meio: {meioPagamentoFilter}
                    <button type="button" onClick={() => setMeioPagamentoFilter('todos')} className="hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {periodoFilter !== 'todos' && (
                  <span className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded-md border border-zinc-700">
                    Período: {periodoFilter}
                    <button type="button" onClick={() => setPeriodoFilter('todos')} className="hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {ordenacao !== 'recente' && (
                  <span className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded-md border border-zinc-700">
                    Ordem: {ordenacao}
                    <button type="button" onClick={() => setOrdenacao('recente')} className="hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleLimparFiltros}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 cursor-pointer select-none ml-1 transition-all"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Limpar Filtros</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Lista de Pedidos */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 text-zinc-500">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500 mb-3" />
            <p className="text-sm font-medium">Carregando pedidos...</p>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-16 text-center text-zinc-500">
            <Package className="h-12 w-12 mb-3 stroke-zinc-700" />
            <h3 className="text-base font-semibold text-zinc-300">Nenhum Pedido Encontrado</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Não há pedidos correspondentes aos filtros selecionados no momento.
            </p>
            {hasAnyFilterActive && (
              <button
                type="button"
                onClick={handleLimparFiltros}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold cursor-pointer transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Resetar Filtros</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pedidosFiltrados.map((pedido) => {
              const clienteObj = Array.isArray(pedido.clientes) ? pedido.clientes[0] : pedido.clientes
              const isExpanded = expandedId === pedido.id
              const isCurrentAction = actionLoadingId === pedido.id

              const statusColors: Record<string, string> = {
                novo: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                confirmado: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                entregue: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                cancelado: 'bg-red-500/10 text-red-400 border-red-500/20',
              }

              const statusLabels: Record<string, string> = {
                novo: 'Recebido',
                confirmado: 'Confirmado / Em Preparo',
                entregue: 'Entregue / Concluído',
                cancelado: 'Cancelado',
              }

              const pagamentoColors: Record<string, string> = {
                pendente: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                aprovado: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                rejeitado: 'text-red-400 bg-red-500/10 border-red-500/20',
                reembolsado: 'text-zinc-400 bg-zinc-800 border-zinc-700',
              }

              const pagamentoLabels: Record<string, string> = {
                pendente: 'Pendente',
                aprovado: 'Pago & Aprovado',
                rejeitado: 'Rejeitado',
                reembolsado: 'Reembolsado',
              }

              return (
                <div
                  key={pedido.id}
                  className={`rounded-2xl border flex flex-col justify-between transition-all backdrop-blur-xs ${
                    pedido.status === 'cancelado'
                      ? 'border-zinc-800/60 bg-zinc-950/40 opacity-75'
                      : pedido.status === 'entregue'
                      ? 'border-emerald-950 bg-zinc-900/30'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 shadow-lg'
                  }`}
                >
                  <div className="p-5 space-y-4">
                    {/* Topo do Card: Número e Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-zinc-100">
                          #{pedido.id.substring(0, 8)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${
                            statusColors[pedido.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {statusLabels[pedido.status] || pedido.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        {formatarData(pedido.data_criacao)}
                      </span>
                    </div>

                    {/* Cliente Info */}
                    <div className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-amber-500" />
                          {clienteObj?.nome || 'Cliente Balcão'}
                        </span>
                        <Link
                          href={`/atendimento`}
                          className="text-[11px] text-amber-500 hover:text-amber-400 font-semibold flex items-center gap-1 transition-colors"
                          title="Abrir no console de atendimento"
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span>Chat</span>
                        </Link>
                      </div>

                      {clienteObj?.telefone && (
                        <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-zinc-500" />
                            {formatarTelefone(clienteObj.telefone)}
                          </span>
                          <a
                            href={`https://wa.me/${clienteObj.telefone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                          >
                            WhatsApp
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Resumo de Itens do Pedido */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span className="font-semibold uppercase tracking-wider text-[10px]">
                          Itens do Pedido ({pedido.itens?.length || 0})
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : pedido.id)}
                          className="text-[11px] text-amber-500 hover:text-amber-400 flex items-center gap-0.5 cursor-pointer font-medium"
                        >
                          {isExpanded ? 'Recolher' : 'Ver Detalhes'}
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Lista de Itens (Compacta ou Expandida) */}
                      <div className="space-y-1.5">
                        {(isExpanded ? pedido.itens : pedido.itens?.slice(0, 2))?.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/40"
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <span className="font-bold text-amber-500 font-mono text-xs">
                                {item.quantidade}x
                              </span>
                              <span className="truncate text-zinc-200 text-xs">
                                {item.produtos?.nome || 'Assado Especial'}
                              </span>
                            </div>
                            <span className="font-mono text-zinc-400 text-xs shrink-0">
                              {formatarMoeda(item.preco_total_centavos ?? (item.preco_unitario_centavos * item.quantidade))}
                            </span>
                          </div>
                        ))}

                        {!isExpanded && (pedido.itens?.length || 0) > 2 && (
                          <p className="text-[10px] text-zinc-500 italic pl-1">
                            + {(pedido.itens?.length || 0) - 2} outro(s) item(ns)...
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Total e Pagamento */}
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                          {pedido.meio_pagamento.replace('_', ' ')} • {pedido.tipo_entrega}
                        </div>
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            pagamentoColors[pedido.status_pagamento]
                          }`}
                        >
                          {pagamentoLabels[pedido.status_pagamento]}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-zinc-500 block">Total:</span>
                        <span className="text-base font-extrabold font-mono text-amber-400">
                          {formatarMoeda(pedido.total_pedido_centavos)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações do Atendente / Operador */}
                  {pedido.status !== 'cancelado' && (
                    <div className="p-4 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center gap-2 rounded-b-2xl">
                      {pedido.status !== 'entregue' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleMarcarEntregue(pedido.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer select-none active:scale-98 disabled:opacity-50"
                          title="Finalizar pedido e marcar como entregue"
                        >
                          {isCurrentAction ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Marcar Entregue</span>
                            </>
                          )}
                        </button>
                      )}

                      {pedido.status_pagamento === 'pendente' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleAprovarPagamento(pedido.id)}
                          className="flex items-center justify-center gap-1 py-2 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 rounded-xl text-xs font-bold transition-all cursor-pointer select-none active:scale-95 disabled:opacity-50"
                          title="Confirmar recebimento do pagamento em dinheiro ou PIX"
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                          <span>Pago</span>
                        </button>
                      )}

                      {pedido.status_pagamento === 'pendente' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleGerarLinkPagamento(pedido.id)}
                          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-xl transition-all cursor-pointer select-none"
                          title="Gerar / Abrir Link de Pagamento no Mercado Pago"
                        >
                          <QrCode className="h-4 w-4" />
                        </button>
                      )}

                      {pedido.status !== 'entregue' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleCancelarPedido(pedido.id)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-950/40 rounded-xl border border-transparent hover:border-red-900/40 transition-colors cursor-pointer select-none"
                          title="Cancelar pedido e restaurar estoque"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
