'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  QrCode,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  actionListarPedidos,
  actionAtualizarStatusPedido,
  actionAtualizarStatusPagamento,
  gerarPreferenciaPagamento
} from '@/app/actions/pedidos'

interface PedidoItem {
  id: string
  quantidade: number
  preco_unitario_centavos: number
  preco_total_centavos: number
  produtos?: any
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
  itens?: PedidoItem[]
}

interface OperatorClientOrdersListProps {
  clienteId: string
  clienteNome: string
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
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dataIso
  }
}

export default function OperatorClientOrdersList({
  clienteId,
  clienteNome,
}: OperatorClientOrdersListProps) {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [expandedPedidoId, setExpandedPedidoId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const carregarPedidos = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setErrorMsg(null)

    try {
      const res = await actionListarPedidos({ clienteId, limite: 20 })
      if (res.success && res.data) {
        setPedidos(res.data as unknown as Pedido[])
      } else {
        setErrorMsg((res as any).error || 'Erro ao carregar histórico de pedidos.')
      }
    } catch (err: any) {
      console.error('Erro ao listar pedidos do cliente:', err)
      setErrorMsg('Erro inesperado ao consultar pedidos.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clienteId])

  useEffect(() => {
    carregarPedidos()
  }, [carregarPedidos])

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
        setSuccessMsg('Pedido marcado como Entregue!')
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg((res as any).error || 'Erro ao atualizar status do pedido.')
      }
    } catch (err: any) {
      console.error('Erro ao marcar entregue:', err)
      setErrorMsg('Erro ao atualizar pedido.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancelarPedido = async (pedidoId: string) => {
    if (!confirm('Deseja realmente cancelar este pedido? O estoque dos produtos será restaurado automaticamente.')) {
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
        setSuccessMsg('Pedido cancelado e estoque restaurado!')
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg((res as any).error || 'Erro ao cancelar pedido.')
      }
    } catch (err: any) {
      console.error('Erro ao cancelar pedido:', err)
      setErrorMsg('Erro ao cancelar pedido.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleAprovarPagamento = async (pedidoId: string) => {
    setActionLoadingId(pedidoId)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await actionAtualizarStatusPagamento({
        pedidoId,
        statusPagamento: 'aprovado',
      })

      if (res.success) {
        setSuccessMsg('Pagamento marcado como Aprovado!')
        await carregarPedidos(true)
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg(res.error || 'Erro ao aprovar pagamento.')
      }
    } catch (err: any) {
      console.error('Erro ao aprovar pagamento:', err)
      setErrorMsg('Erro ao aprovar pagamento.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleGerarLinkPagamento = async (pedidoId: string) => {
    setActionLoadingId(pedidoId)
    setErrorMsg(null)

    try {
      const res = await gerarPreferenciaPagamento(pedidoId)
      if (res.success && res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer')
      } else {
        setErrorMsg(res.error || 'Erro ao gerar link de pagamento.')
      }
    } catch (err: any) {
      console.error('Erro ao gerar pagamento:', err)
      setErrorMsg('Erro ao gerar pagamento.')
    } finally {
      setActionLoadingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500 mb-2" />
        <p className="text-xs">Carregando pedidos de {clienteNome}...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Pedidos Realizados ({pedidos.length})
          </span>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => carregarPedidos(true)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors focus:outline-none cursor-pointer"
          title="Atualizar lista de pedidos"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-red-950/40 border border-red-900/50 p-2.5 text-xs text-red-200 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-900/50 p-2.5 text-xs text-emerald-200 shrink-0">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="flex-1">{successMsg}</span>
        </div>
      )}

      {/* Lista de Pedidos */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center text-zinc-500">
            <Package className="h-8 w-8 mb-2 stroke-zinc-700" />
            <p className="text-xs font-medium text-zinc-400">Nenhum Pedido Concluído</p>
            <p className="text-[11px] text-zinc-600 mt-1 max-w-[220px]">
              Os pedidos confirmados e convertidos do carrinho para este cliente aparecerão aqui.
            </p>
          </div>
        ) : (
          pedidos.map((pedido) => {
            const isExpanded = expandedPedidoId === pedido.id
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
              pendente: 'text-amber-400',
              aprovado: 'text-emerald-400',
              rejeitado: 'text-red-400',
              reembolsado: 'text-zinc-400',
            }

            const pagamentoLabels: Record<string, string> = {
              pendente: 'Pagamento Pendente',
              aprovado: 'Pago & Aprovado',
              rejeitado: 'Pagamento Rejeitado',
              reembolsado: 'Reembolsado',
            }

            return (
              <div
                key={pedido.id}
                className={`rounded-xl border transition-all ${
                  pedido.status === 'cancelado'
                    ? 'border-zinc-800/60 bg-zinc-950/40 opacity-75'
                    : pedido.status === 'entregue'
                    ? 'border-emerald-950 bg-emerald-950/10'
                    : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                }`}
              >
                {/* Cabeçalho do Card */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-zinc-100">
                        #{pedido.id.substring(0, 8)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                          statusColors[pedido.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {statusLabels[pedido.status] || pedido.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatarData(pedido.data_criacao)}
                    </span>
                  </div>

                  {/* Detalhes de Pagamento e Total */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-xs">
                    <div>
                      <div className="text-[10px] text-zinc-500 capitalize">
                        {pedido.meio_pagamento.replace('_', ' ')} • {pedido.tipo_entrega}
                      </div>
                      <div className={`text-[11px] font-medium ${pagamentoColors[pedido.status_pagamento]}`}>
                        {pagamentoLabels[pedido.status_pagamento]}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold font-mono text-amber-400">
                        {formatarMoeda(pedido.total_pedido_centavos)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Itens do Pedido (Toggle) */}
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => setExpandedPedidoId(isExpanded ? null : pedido.id)}
                    className="w-full flex items-center justify-between py-1 px-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer select-none"
                  >
                    <span>
                      {pedido.itens?.length || 0} {pedido.itens?.length === 1 ? 'item' : 'itens'} no pedido
                    </span>
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  {isExpanded && pedido.itens && pedido.itens.length > 0 && (
                    <div className="mt-2 space-y-1.5 pt-1 border-t border-zinc-800/40">
                      {pedido.itens.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-[11px] py-1 px-1.5 rounded bg-zinc-950/40"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                            <span className="font-bold text-amber-500 font-mono">
                              {item.quantidade}x
                            </span>
                            <span className="truncate text-zinc-200">
                              {item.produtos?.nome || 'Assado Especial'}
                            </span>
                          </div>
                          <span className="font-mono text-zinc-400 shrink-0">
                            {formatarMoeda(item.preco_total_centavos ?? (item.preco_unitario_centavos * item.quantidade))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ações do Atendente */}
                  {pedido.status !== 'cancelado' && (
                    <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-zinc-800/60">
                      {pedido.status !== 'entregue' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleMarcarEntregue(pedido.id)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none active:scale-95 disabled:opacity-50"
                          title="Finalizar e marcar como entregue"
                        >
                          {isCurrentAction ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Entregue</span>
                            </>
                          )}
                        </button>
                      )}

                      {pedido.status_pagamento === 'pendente' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleAprovarPagamento(pedido.id)}
                          className="flex items-center justify-center gap-1 py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded-lg text-[11px] font-semibold transition-all cursor-pointer select-none active:scale-95 disabled:opacity-50"
                          title="Confirmar recebimento do pagamento"
                        >
                          <DollarSign className="h-3 w-3" />
                          <span>Pago</span>
                        </button>
                      )}

                      {pedido.status_pagamento === 'pendente' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleGerarLinkPagamento(pedido.id)}
                          className="flex items-center justify-center p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] transition-all cursor-pointer select-none"
                          title="Gerar / Abrir Link de Pagamento"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {pedido.status !== 'entregue' && (
                        <button
                          type="button"
                          disabled={isCurrentAction}
                          onClick={() => handleCancelarPedido(pedido.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer select-none"
                          title="Cancelar pedido e estornar estoque"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
