'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, Loader2, ShoppingCart, DollarSign, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { criarPedidoOperador } from '@/app/actions/pedidos'
import { sortProductsByOfficialOrder } from '@/lib/product-ordering'
import { Conversa } from './ConversationsQueue'

interface Produto {
  id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  ativo: boolean
  ordem_exibicao: number | null
}

interface ItemSelecionado {
  produto_id: string
  quantidade: number
  nome: string
  preco_centavos: number
}

interface CreateOrderModalProps {
  conversa: Conversa
  isOpen: boolean
  onClose: () => void
  onOrderCreated?: () => void
}

export default function CreateOrderModal({
  conversa,
  isOpen,
  onClose,
  onOrderCreated
}: CreateOrderModalProps) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loadingProdutos, setLoadingProdutos] = useState(false)
  const [itens, setItens] = useState<ItemSelecionado[]>([])
  
  // Dados do formulário
  const [tipoEntrega, setTipoEntrega] = useState<'entrega' | 'retirada'>('retirada')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [taxaEntregaBrl, setTaxaEntregaBrl] = useState('0,00')
  const [meioPagamento, setMeioPagamento] = useState<'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'>('pix')
  
  // Estado para adicionar produto
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState('')
  const [quantidadeAdicionar, setQuantidadeAdicionar] = useState(1)

  // Status de envio
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  // Buscar produtos ativos do catálogo
  useEffect(() => {
    if (!isOpen) return

    async function carregarProdutos() {
      setLoadingProdutos(true)
      try {
        const { data, error } = await supabase
          .from('produtos')
          .select('*')
          .eq('ativo', true)
          .order('ordem_exibicao', { ascending: true, nullsFirst: false })
          .order('nome', { ascending: true })
          .order('id', { ascending: true })

        if (error) throw error
        const orderedProducts = sortProductsByOfficialOrder(data || [])
        setProdutos(orderedProducts)
        if (orderedProducts.length > 0) {
          setProdutoSelecionadoId(orderedProducts[0].id)
        }
      } catch (err: any) {
        console.error('Erro ao buscar produtos:', err)
        setErro('Não foi possível carregar os produtos do catálogo.')
      } finally {
        setLoadingProdutos(false)
      }
    }

    carregarProdutos()
  }, [isOpen, supabase])

  // Preencher endereço do cliente quando o modal abrir ou tipo de entrega mudar
  useEffect(() => {
    if (isOpen && conversa.clientes?.endereco) {
      setEnderecoEntrega(conversa.clientes.endereco)
    } else if (!isOpen) {
      // Resetar form quando fechar
      setItens([])
      setTipoEntrega('retirada')
      setEnderecoEntrega('')
      setTaxaEntregaBrl('0,00')
      setMeioPagamento('pix')
      setErro(null)
      setSucesso(false)
    }
  }, [isOpen, conversa.clientes?.endereco])

  if (!isOpen) return null

  // Adicionar item à lista
  const handleAdicionarItem = () => {
    if (!produtoSelecionadoId) return

    const produto = produtos.find((p) => p.id === produtoSelecionadoId)
    if (!produto) return

    const itemExistente = itens.find((i) => i.produto_id === produtoSelecionadoId)
    if (itemExistente) {
      setItens(
        itens.map((i) =>
          i.produto_id === produtoSelecionadoId
            ? { ...i, quantidade: i.quantidade + quantidadeAdicionar }
            : i
        )
      )
    } else {
      setItens([
        ...itens,
        {
          produto_id: produto.id,
          quantidade: quantidadeAdicionar,
          nome: produto.nome,
          preco_centavos: produto.preco_centavos,
        },
      ])
    }
    // Resetar quantidade
    setQuantidadeAdicionar(1)
  }

  // Remover item da lista
  const handleRemoverItem = (produtoId: string) => {
    setItens(itens.filter((item) => item.produto_id !== produtoId))
  }

  // Alterar quantidade de um item
  const handleAlterarQuantidadeItem = (produtoId: string, quantidade: number) => {
    if (quantidade <= 0) {
      handleRemoverItem(produtoId)
      return
    }
    setItens(
      itens.map((item) =>
        item.produto_id === produtoId ? { ...item, quantidade } : item
      )
    )
  }

  // Cálculos em tempo real
  const totalProdutosCentavos = itens.reduce(
    (acc, item) => acc + item.preco_centavos * item.quantidade,
    0
  )

  // Conversão segura do input da taxa de entrega BRL para centavos
  const parseBrlParaCentavos = (valorBrl: string): number => {
    const limpo = valorBrl.replace(/\s/g, '').replace(',', '.')
    const parsed = parseFloat(limpo)
    if (isNaN(parsed) || parsed < 0) return 0
    return Math.round(parsed * 100)
  }

  const taxaEntregaCentavos = tipoEntrega === 'entrega' ? parseBrlParaCentavos(taxaEntregaBrl) : 0
  const totalPedidoCentavos = totalProdutosCentavos + taxaEntregaCentavos

  // Formatação para BRL
  const formatarCentavosParaBrl = (centavos: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(centavos / 100)
  }

  // Submeter o Pedido
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (itens.length === 0) {
      setErro('Adicione pelo menos um produto ao pedido.')
      return
    }

    if (tipoEntrega === 'entrega' && !enderecoEntrega.trim()) {
      setErro('O endereço de entrega é obrigatório para a opção "Entrega".')
      return
    }

    setEnviando(true)
    setErro(null)

    try {
      const payload = {
        cliente_id: conversa.cliente_id,
        conversa_id: conversa.id,
        tipo_entrega: tipoEntrega,
        endereco_entrega: tipoEntrega === 'entrega' ? enderecoEntrega : null,
        taxa_entrega_centavos: taxaEntregaCentavos,
        meio_pagamento: meioPagamento,
        itens: itens.map((item) => ({
          produto_id: item.produto_id,
          quantidade: item.quantidade,
        })),
      }

      const response = await criarPedidoOperador(payload)

      if (response.success) {
        setSucesso(true)
        if (onOrderCreated) {
          onOrderCreated()
        }
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setErro(response.error || 'Erro ao criar pedido.')
      }
    } catch (err: any) {
      console.error('Erro ao enviar pedido:', err)
      setErro('Erro interno do servidor ao tentar criar o pedido.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl transition-all duration-350">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-zinc-100">Criar Novo Pedido Rápido</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cliente Contexto */}
        <div className="mb-6 rounded-xl bg-zinc-950/40 p-4 border border-zinc-800/50 flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">Cliente</span>
            <span className="text-sm font-medium text-zinc-200">{conversa.clientes?.nome || 'Sem nome'}</span>
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">Telefone</span>
            <span className="text-sm font-mono text-zinc-300">
              {conversa.clientes?.telefone
                ? conversa.clientes.telefone.startsWith('55') && conversa.clientes.telefone.length === 13
                  ? `+55 (${conversa.clientes.telefone.substring(2, 4)}) ${conversa.clientes.telefone.substring(4, 9)}-${conversa.clientes.telefone.substring(9)}`
                  : conversa.clientes.telefone
                : 'Não cadastrado'}
            </span>
          </div>
        </div>

        {sucesso ? (
          <div className="flex flex-col items-center justify-center py-12 text-center animate-pulse">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-500 mb-4">
              ✓
            </div>
            <h3 className="text-lg font-medium text-zinc-100">Pedido Criado com Sucesso!</h3>
            <p className="text-xs text-zinc-400 mt-2">O pedido foi registrado com status "novo". Fechando modal...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Adicionar Itens */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Adicionar Produtos
              </label>
              
              {loadingProdutos ? (
                <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                  Carregando catálogo...
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={produtoSelecionadoId}
                    onChange={(e) => setProdutoSelecionadoId(e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                  >
                    {produtos.length === 0 ? (
                      <option value="">Nenhum produto ativo encontrado</option>
                    ) : (
                      produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} - {formatarCentavosParaBrl(p.preco_centavos)}
                        </option>
                      ))
                    )}
                  </select>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={quantidadeAdicionar}
                      onChange={(e) => setQuantidadeAdicionar(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-center text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAdicionarItem}
                      disabled={produtos.length === 0}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-zinc-800 px-4 text-xs font-semibold text-zinc-200 border border-zinc-700/60 hover:bg-zinc-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-4 w-4 text-amber-500" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Lista de Itens do Pedido */}
            <div className="space-y-3">
              <span className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Itens do Pedido ({itens.length})
              </span>
              
              {itens.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
                  Nenhum item adicionado a este pedido.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950/20 max-h-48 overflow-y-auto">
                  {itens.map((item) => (
                    <div key={item.produto_id} className="flex items-center justify-between p-3 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{item.nome}</p>
                        <p className="text-xs text-zinc-500">
                          {formatarCentavosParaBrl(item.preco_centavos)} cada
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 bg-zinc-950 rounded-lg border border-zinc-800 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleAlterarQuantidadeItem(item.produto_id, item.quantidade - 1)}
                            className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-medium text-zinc-200">
                            {item.quantidade}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAlterarQuantidadeItem(item.produto_id, item.quantidade + 1)}
                            className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                          >
                            +
                          </button>
                        </div>
                        
                        <span className="text-sm font-semibold text-zinc-300 w-24 text-right">
                          {formatarCentavosParaBrl(item.preco_centavos * item.quantidade)}
                        </span>
                        
                        <button
                          type="button"
                          onClick={() => handleRemoverItem(item.produto_id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Configurações de Entrega */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Tipo de Entrega
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoEntrega('retirada')}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all cursor-pointer ${
                      tipoEntrega === 'retirada'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Retirada
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoEntrega('entrega')}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all cursor-pointer ${
                      tipoEntrega === 'entrega'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Entrega
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Meio de Pagamento
                </label>
                <select
                  value={meioPagamento}
                  onChange={(e) => setMeioPagamento(e.target.value as any)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="pix">PIX</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>

            {/* Endereço e Taxa de Entrega (se for Entrega) */}
            {tipoEntrega === 'entrega' && (
              <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/10 p-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <MapPin className="h-3.5 w-3.5 text-amber-500" />
                    <span>Endereço de Entrega</span>
                  </label>
                  <input
                    type="text"
                    value={enderecoEntrega}
                    onChange={(e) => setEnderecoEntrega(e.target.value)}
                    placeholder="Rua, número, complemento e bairro"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-650 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <DollarSign className="h-3.5 w-3.5 text-amber-500" />
                    <span>Taxa de Entrega (BRL)</span>
                  </label>
                  <input
                    type="text"
                    value={taxaEntregaBrl}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '')
                      setTaxaEntregaBrl(val)
                    }}
                    placeholder="0,00"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-650 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Resumo Financeiro */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2.5">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Subtotal Produtos:</span>
                <span>{formatarCentavosParaBrl(totalProdutosCentavos)}</span>
              </div>
              
              {tipoEntrega === 'entrega' && (
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Taxa de Entrega:</span>
                  <span>{formatarCentavosParaBrl(taxaEntregaCentavos)}</span>
                </div>
              )}
              
              <div className="border-t border-zinc-800 pt-2 flex justify-between text-sm font-semibold text-zinc-100">
                <span>Total Estimado:</span>
                <span className="text-amber-500">{formatarCentavosParaBrl(totalPedidoCentavos)}</span>
              </div>
            </div>

            {/* Notificação de Erro */}
            {erro && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                {erro}
              </div>
            )}

            {/* Botões do Rodapé */}
            <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={enviando}
                className="rounded-xl border border-zinc-800 bg-transparent px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              
              <button
                type="submit"
                disabled={enviando}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-600 active:scale-95 transition-all shadow-lg shadow-amber-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Criando Pedido...</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" />
                    <span>Criar Pedido</span>
                  </>
                )}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  )
}
