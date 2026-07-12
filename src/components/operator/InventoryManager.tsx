'use client'

import React, { useState, useEffect } from 'react'
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Image as ImageIcon,
  Upload,
  Minus,
  Plus as PlusIcon,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
  Search
} from 'lucide-react'
import {
  listarProdutos,
  criarProduto,
  atualizarProduto,
  excluirProduto,
  alternarStatusProduto,
  ajustarEstoque,
  listarMovimentacoes,
  uploadImagemProduto,
  removerImagemProduto
} from '@/app/actions/estoque'

interface Produto {
  id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  quantidade_estoque: number
  estoque_minimo: number
  controlar_estoque: boolean
  ativo: boolean
  url_imagem: string | null
  url_imagem_thumb: string | null
  url_imagem_2: string | null
  url_imagem_2_thumb: string | null
  data_criacao?: string
  data_atualizacao?: string
}

interface Movimentacao {
  id: string
  produto_id: string
  tipo: string
  quantidade: number
  quantidade_anterior: number
  quantidade_nova: number
  motivo: string | null
  usuario_id: string | null
  data_criacao: string
}

type FilterType = 'todos' | 'ativos' | 'esgotados'
const PRODUCT_FORM_ID = 'inventory-product-form'

function formatarPreco(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(centavos / 100)
}

function brlParaCentavos(valorStr: string): number {
  const limpo = valorStr.replace(/\s/g, '').replace(/R\$/g, '').replace(/\./g, '').replace(/,/g, '.')
  const parsed = parseFloat(limpo)
  if (isNaN(parsed)) return 0
  return Math.round(parsed * 100)
}

function centavosParaBrl(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',')
}

function getSupabaseImageUrl(path: string | null): string | null {
  if (!path) return null
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/produto-imagens/${path}`
}

function revokeObjectUrl(url: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export default function InventoryManager() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [filter, setFilter] = useState<FilterType>('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Produto | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState<Produto | null>(null)

  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [movements, setMovements] = useState<Movimentacao[]>([])
  const [loadingMovements, setLoadingMovements] = useState(false)

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [precoBrl, setPrecoBrl] = useState('')
  const [quantidadeInicial, setQuantidadeInicial] = useState(0)
  const [estoqueMinimo, setEstoqueMinimo] = useState(5)
  const [controlarEstoque, setControlarEstoque] = useState(true)

  const [uploadingIndex, setUploadingIndex] = useState<1 | 2 | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [imagePreview1, setImagePreview1] = useState<string | null>(null)
  const [imagePreview2, setImagePreview2] = useState<string | null>(null)
  
  // Arquivos pendentes para upload durante criação (sem ID do produto ainda)
  const [pendingFile1, setPendingFile1] = useState<File | null>(null)
  const [pendingFile2, setPendingFile2] = useState<File | null>(null)

  const [isPending, setIsPending] = useState(false)
  const [adjustingProduct, setAdjustingProduct] = useState<string | null>(null)

  const fetchProdutos = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listarProdutos(filter === 'todos' ? undefined : filter === 'ativos' ? 'ativos' : 'esgotados')
      if (res.success && res.data) {
        setProdutos(res.data)
      } else {
        setError(res.error || 'Erro ao carregar produtos')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
     
    fetchProdutos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  useEffect(() => {
    return () => revokeObjectUrl(imagePreview1)
  }, [imagePreview1])

  useEffect(() => {
    return () => revokeObjectUrl(imagePreview2)
  }, [imagePreview2])

  const fetchMovements = async (produtoId: string) => {
    setLoadingMovements(true)
    try {
      const res = await listarMovimentacoes(produtoId)
      if (res.success && res.data) {
        setMovements(res.data)
      }
    } catch {
      setMovements([])
    } finally {
      setLoadingMovements(false)
    }
  }

  const handleToggleExpand = (produtoId: string) => {
    if (expandedProduct === produtoId) {
      setExpandedProduct(null)
      setMovements([])
    } else {
      setExpandedProduct(produtoId)
      fetchMovements(produtoId)
    }
  }

  const resetForm = () => {
    setNome('')
    setDescricao('')
    setPrecoBrl('')
    setQuantidadeInicial(0)
    setEstoqueMinimo(5)
    setControlarEstoque(true)
    setEditProduct(null)
    setImagePreview1(null)
    setImagePreview2(null)
    setPendingFile1(null)
    setPendingFile2(null)
    setUploadError(null)
  }

  const handleNewProduct = () => {
    resetForm()
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    resetForm()
  }

  const handleEditProduct = (produto: Produto) => {
    resetForm()
    setEditProduct(produto)
    setNome(produto.nome)
    setDescricao(produto.descricao || '')
    setPrecoBrl(centavosParaBrl(produto.preco_centavos))
    setQuantidadeInicial(produto.quantidade_estoque)
    setEstoqueMinimo(produto.estoque_minimo)
    setControlarEstoque(produto.controlar_estoque)
    setImagePreview1(getSupabaseImageUrl(produto.url_imagem_thumb))
    setImagePreview2(getSupabaseImageUrl(produto.url_imagem_2_thumb))
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setUploadError(null)

    const precoCentavos = brlParaCentavos(precoBrl)
    if (!nome.trim()) {
      setError('O nome do produto é obrigatório')
      return
    }
    if (precoCentavos <= 0 && precoBrl !== '0' && precoBrl !== '0,00') {
      setError('Insira um preço válido maior ou igual a zero')
      return
    }

    setIsPending(true)
    try {
      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        preco_centavos: precoCentavos,
        quantidade_estoque: quantidadeInicial,
        estoque_minimo: estoqueMinimo,
        controlar_estoque: controlarEstoque,
      }

      let res
      if (editProduct) {
        res = await atualizarProduto(editProduct.id, payload)
      } else {
        res = await criarProduto(payload)
      }

      if (res.success) {
        // Se criou produto novo e tem imagens pendentes, fazer upload agora
        if (!editProduct && res.data?.id) {
          const novoId = res.data.id
          if (pendingFile1) {
            const formData1 = new FormData()
            formData1.append('file', pendingFile1)
            await uploadImagemProduto(novoId, formData1, 1).catch(err => {
              console.error('Erro ao enviar imagem 1:', err)
            })
          }
          if (pendingFile2) {
            const formData2 = new FormData()
            formData2.append('file', pendingFile2)
            await uploadImagemProduto(novoId, formData2, 2).catch(err => {
              console.error('Erro ao enviar imagem 2:', err)
            })
          }
        }

        setModalOpen(false)
        resetForm()
        setSuccessMsg(editProduct ? 'Produto atualizado com sucesso!' : 'Produto criado com sucesso!')
        setTimeout(() => setSuccessMsg(null), 3000)
        fetchProdutos()
      } else {
        setError(res.error || 'Erro ao salvar produto')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setIsPending(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsPending(true)
    try {
      const res = await excluirProduto(deleteConfirm.id)
      if (res.success) {
        setDeleteConfirm(null)
        setSuccessMsg('Produto excluído com sucesso!')
        setTimeout(() => setSuccessMsg(null), 3000)
        fetchProdutos()
      } else {
        setError(res.error || 'Erro ao excluir produto')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setIsPending(false)
    }
  }

  const handleToggleStatus = async (produto: Produto) => {
    const novoStatus = !produto.ativo
    setProdutos(prev => prev.map(p => p.id === produto.id ? { ...p, ativo: novoStatus } : p))
    const res = await alternarStatusProduto(produto.id, novoStatus)
    if (!res.success) {
      setProdutos(prev => prev.map(p => p.id === produto.id ? { ...p, ativo: produto.ativo } : p))
      setError(res.error || 'Erro ao alterar status')
    }
  }

  const handleAdjustStock = async (produto: Produto, tipo: 'entrada' | 'saida', quantidade: number) => {
    setAdjustingProduct(produto.id)
    try {
      const res = await ajustarEstoque(produto.id, quantidade, tipo, 'Ajuste rápido via dashboard')
      if (res.success) {
        setProdutos(prev =>
          prev.map(p =>
            p.id === produto.id
              ? { ...p, quantidade_estoque: res.data!.qtd_nova, ativo: res.data!.qtd_nova > 0 || !p.controlar_estoque ? p.ativo : false }
              : p
          )
        )
      } else {
        setError(res.error || 'Erro ao ajustar estoque')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setAdjustingProduct(null)
    }
  }

  const handleImageUpload = async (produtoId: string | null, file: File, index: 1 | 2) => {
    setUploadError(null)
    setUploadingIndex(index)

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Arquivo excede o limite de 10MB')
      setUploadingIndex(null)
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Formato inválido. Aceito: JPEG, PNG, WebP')
      setUploadingIndex(null)
      return
    }

    // Modo criação: armazenar arquivo temporariamente (upload após criar produto)
    if (!produtoId) {
      const objectUrl = URL.createObjectURL(file)
      if (index === 1) {
        setPendingFile1(file)
        setImagePreview1(objectUrl)
      } else {
        setPendingFile2(file)
        setImagePreview2(objectUrl)
      }
      setUploadingIndex(null)
      return
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await uploadImagemProduto(produtoId, formData, index)

      if (res.success && res.data) {
        const previewUrl = getSupabaseImageUrl(res.data.thumb)
        if (index === 1) {
          setImagePreview1(previewUrl)
        } else {
          setImagePreview2(previewUrl)
        }
        fetchProdutos()
      } else {
        setUploadError(res.error || 'Erro ao enviar imagem')
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setUploadingIndex(null)
    }
  }

  const handleRemoveImage = async (produtoId: string, index: 1 | 2) => {
    try {
      const res = await removerImagemProduto(produtoId, index)
      if (res.success) {
        if (index === 1) setImagePreview1(null)
        else setImagePreview2(null)
        fetchProdutos()
      } else {
        setError(res.error || 'Erro ao remover imagem')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    }
  }

  const filteredProdutos = produtos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.descricao && p.descricao.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchSearch
  })

  const formatarTipoMov = (tipo: string) => {
    switch (tipo) {
      case 'entrada': return { label: 'Entrada', color: 'text-emerald-400 bg-emerald-500/10' }
      case 'saida': return { label: 'Saída', color: 'text-rose-400 bg-rose-500/10' }
      case 'ajuste': return { label: 'Ajuste', color: 'text-amber-400 bg-amber-500/10' }
      case 'cancelamento': return { label: 'Cancel.', color: 'text-zinc-400 bg-zinc-500/10' }
      default: return { label: tipo, color: 'text-zinc-400 bg-zinc-500/10' }
    }
  }

  const getStockBadge = (produto: Produto) => {
    if (!produto.controlar_estoque) return { label: 'N/A', className: 'text-zinc-400 bg-zinc-500/10' }
    if (produto.quantidade_estoque === 0) return { label: 'Esgotado', className: 'text-rose-400 bg-rose-500/10' }
    if (produto.quantidade_estoque <= produto.estoque_minimo) return { label: 'Baixo', className: 'text-amber-400 bg-amber-500/10' }
    return { label: 'OK', className: 'text-emerald-400 bg-emerald-500/10' }
  }

  const getStockColor = (produto: Produto) => {
    if (!produto.controlar_estoque) return 'text-zinc-400'
    if (produto.quantidade_estoque === 0) return 'text-rose-400'
    if (produto.quantidade_estoque <= produto.estoque_minimo) return 'text-amber-400'
    return 'text-emerald-400'
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin mb-3" />
        <p className="text-sm text-zinc-400">Carregando produtos...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-6 p-1">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-amber-500" />
            Estoque
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Gerencie produtos, preços e controle de estoque.
          </p>
        </div>
        <button
          onClick={handleNewProduct}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-linear-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 active:scale-95 text-zinc-950 font-bold rounded-lg text-sm transition-all shadow-lg cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          Novo Produto
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2.5 text-xs text-red-400 shrink-0">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300 cursor-pointer">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2.5 text-xs text-emerald-400 shrink-0">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por nome ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all"
          />
        </div>

        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/40 p-0.5 w-full sm:w-auto">
          {(['todos', 'ativos', 'esgotados'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer capitalize ${
                filter === f
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'ativos' ? 'Ativos' : 'Esgotados'}
            </button>
          ))}
        </div>
      </div>

      {filteredProdutos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
          <Package className="h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-zinc-400 font-medium text-sm">Nenhum produto encontrado</p>
          <p className="text-xs text-zinc-500 mt-1">Crie um novo produto ou altere os filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
          {filteredProdutos.map((produto) => {
            const stockBadge = getStockBadge(produto)
            const stockColor = getStockColor(produto)
            const isExpanded = expandedProduct === produto.id
            const isAdjusting = adjustingProduct === produto.id
            const imgUrl = getSupabaseImageUrl(produto.url_imagem_thumb)

            return (
              <React.Fragment key={produto.id}>
                <div
                  className={`group relative bg-zinc-900/40 border rounded-xl overflow-hidden transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/5 flex flex-col ${
                    isExpanded ? 'border-amber-500/40 shadow-lg shadow-amber-500/5' : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                  onClick={() => handleToggleExpand(produto.id)}
                >
                  {/* Imagem do produto */}
                  <div className="relative h-28 bg-zinc-950 overflow-hidden">
                    {imgUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imgUrl}
                        alt={produto.nome}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-9 w-9 text-zinc-700" />
                      </div>
                    )}
                    {/* Overlay gradient on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    {/* Status badge */}
                    <div className="absolute top-2 right-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleStatus(produto) }}
                        disabled={isPending}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border transition-all cursor-pointer ${
                          produto.ativo
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                            : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-500 hover:bg-zinc-700'
                        }`}
                        title="Alternar status"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${produto.ativo ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                        {produto.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>
                  </div>

                  {/* Card content */}
                  <div className="p-3 flex-1 flex flex-col gap-2">
                    <div className="space-y-1">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-zinc-100 truncate">{produto.nome}</h3>
                        {produto.descricao && (
                          <p className="text-[11px] leading-snug text-zinc-400 line-clamp-1">{produto.descricao}</p>
                        )}
                      </div>
                      <span className="block font-mono font-bold text-amber-400/90 text-xs">
                        {formatarPreco(produto.preco_centavos)}
                      </span>
                    </div>

                    {/* Stock row */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        {produto.controlar_estoque && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAdjustStock(produto, 'saida', 1) }}
                            disabled={isAdjusting || produto.quantidade_estoque <= 0}
                            className="p-0.5 hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 rounded transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        )}
                        <span className={`font-mono font-bold text-xs ${stockColor}`}>
                          {produto.controlar_estoque ? produto.quantidade_estoque : 'N/A'}
                        </span>
                        {produto.controlar_estoque && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAdjustStock(produto, 'entrada', 1) }}
                            disabled={isAdjusting}
                            className="p-0.5 hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-400 rounded transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <PlusIcon className="h-3 w-3" />
                          </button>
                        )}
                        {isAdjusting && <Loader2 className="h-3 w-3 animate-spin text-amber-500" />}
                      </div>
                      {produto.controlar_estoque && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${stockBadge.className}`}>
                          {stockBadge.label}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-zinc-800/50">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditProduct(produto) }}
                        className="p-1 hover:bg-zinc-800 hover:text-amber-500 rounded-md text-zinc-400 transition-all cursor-pointer"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(produto) }}
                        className="p-1 hover:bg-rose-500/10 hover:text-rose-400 rounded-md text-zinc-400 transition-all cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: movement history inside the card */}
                  {isExpanded && (
                    <div className="border-t border-zinc-800/50 bg-zinc-950/60 p-2.5 max-h-44 overflow-y-auto">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                        Histórico de Movimentações
                      </div>
                      {loadingMovements ? (
                        <div className="flex items-center gap-2 py-4 text-zinc-500 justify-center">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="text-xs">Carregando...</span>
                        </div>
                      ) : movements.length === 0 ? (
                        <p className="text-xs text-zinc-600 py-2 text-center">Nenhuma movimentação registrada.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {movements.slice(0, 5).map((mov) => {
                            const tipoInfo = formatarTipoMov(mov.tipo)
                            return (
                              <div key={mov.id} className="flex items-center justify-between text-xs text-zinc-400 py-0.5">
                                <span className="text-zinc-600 font-mono w-16 shrink-0">
                                  {new Date(mov.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className={`px-1 py-0.5 rounded text-[9px] font-semibold ${tipoInfo.color} shrink-0`}>
                                  {tipoInfo.label}
                                </span>
                                <span className="font-mono shrink-0 text-right w-8">
                                  {mov.tipo === 'saida' ? '-' : '+'}{mov.quantidade}
                                </span>
                                <span className="font-mono text-zinc-500 truncate ml-1">
                                  {mov.quantidade_anterior}→{mov.quantidade_nova}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Package className="h-5 w-5 text-amber-500" />
                {editProduct ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-zinc-400 hover:text-zinc-200 rounded p-1 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form id={PRODUCT_FORM_ID} onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {uploadError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2.5 text-xs text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Nome <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Picanha Premium"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all"
                  maxLength={255}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Descrição
                </label>
                <textarea
                  placeholder="Descrição do produto..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Preço (R$) <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={precoBrl}
                    onChange={(e) => setPrecoBrl(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm font-mono text-zinc-200 placeholder-zinc-600 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Estoque Mínimo
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={estoqueMinimo}
                    onChange={(e) => setEstoqueMinimo(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm font-mono text-zinc-200 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    {editProduct ? 'Quantidade em Estoque' : 'Quantidade Inicial'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quantidadeInicial}
                    onChange={(e) => setQuantidadeInicial(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm font-mono text-zinc-200 outline-none transition-all"
                  />
                </div>

              <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setControlarEstoque(!controlarEstoque)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    controlarEstoque ? 'bg-emerald-500' : 'bg-zinc-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-zinc-950 shadow-lg ring-0 transition duration-200 ease-in-out ${
                      controlarEstoque ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <label className="text-xs font-semibold text-zinc-300 uppercase cursor-pointer select-none">
                  Controlar estoque
                </label>
              </div>

              <div className="space-y-3">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Fotos (máx. 2)
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    {([1, 2] as const).map((index) => {
                      const preview = index === 1 ? imagePreview1 : imagePreview2
                      const isUploading = uploadingIndex === index

                      return (
                        <div key={index} className="relative">
                          {preview ? (
                            <div className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={preview}
                                alt={`Foto ${index}`}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (editProduct) {
                                    handleRemoveImage(editProduct.id, index)
                                  } else {
                                    if (index === 1) { setPendingFile1(null); setImagePreview1(null) }
                                    else { setPendingFile2(null); setImagePreview2(null) }
                                  }
                                }}
                                className="absolute top-1.5 right-1.5 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded cursor-pointer transition-all"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center aspect-square rounded-lg border border-dashed border-zinc-800 hover:border-amber-500/50 bg-zinc-950/60 cursor-pointer transition-all group">
                              {isUploading ? (
                                <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                              ) : (
                                <>
                                  <Upload className="h-5 w-5 text-zinc-500 group-hover:text-amber-500 transition-colors mb-1" />
                                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">
                                    Foto {index}
                                  </span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleImageUpload(editProduct?.id || null, file, index)
                                }}
                                disabled={isUploading}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-500">JPEG, PNG ou WebP. Máx. 10MB cada.</p>
                </div>
            </form>

            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg transition-all text-sm cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={PRODUCT_FORM_ID}
                disabled={isPending}
                className="flex items-center justify-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-zinc-950 font-bold rounded-lg text-sm transition-all shadow-md shadow-amber-500/10 cursor-pointer disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editProduct ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6">
              <div className="flex items-center gap-3 text-rose-500 mb-4">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-lg font-bold text-zinc-100">Excluir Produto?</h3>
              </div>

              <p className="text-sm text-zinc-400 leading-relaxed mb-2">
                Tem certeza que deseja excluir permanentemente o produto:
              </p>

              <p className="text-sm font-semibold text-zinc-200 border-l-2 border-amber-500 pl-3 py-1 bg-zinc-950/50 rounded mb-4">
                {deleteConfirm.nome}
              </p>

              <p className="text-xs text-zinc-500 leading-relaxed">
                Esta ação removerá o produto, suas imagens do storage e todo o histórico de movimentações.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={isPending}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg transition-all text-sm cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="flex items-center justify-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-zinc-50 font-semibold rounded-lg transition-all text-sm cursor-pointer disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
