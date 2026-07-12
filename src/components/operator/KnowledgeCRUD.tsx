'use client'

import React, { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  Check, 
  Loader2, 
  BookOpen, 
  Tag, 
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  FileText,
  UploadCloud,
  Calendar,
  HardDrive
} from 'lucide-react'
import { 
  criarArtigo, 
  atualizarArtigo, 
  excluirArtigo, 
  alternarStatusArtigo,
  listarDocumentosConhecimento,
  importarDocumentoConhecimento,
  excluirDocumentoConhecimento
} from '@/app/actions/conhecimento'

export interface Artigo {
  id: string
  titulo: string
  conteudo: string
  tags: string[]
  ativo: boolean
  data_criacao?: string
  data_atualizacao?: string
}

export interface DocumentoConhecimento {
  id: string
  nome_arquivo: string
  tamanho_bytes: number
  tipo_mime: string
  caminho_storage: string
  data_criacao?: string
  data_atualizacao?: string
}

interface KnowledgeCRUDProps {
  artigosIniciais: Artigo[]
  perfilFuncao: string
}

export default function KnowledgeCRUD({ artigosIniciais }: KnowledgeCRUDProps) {
  const router = useRouter()
  const [artigos, setArtigos] = useState<Artigo[]>(artigosIniciais)

  // Sync articles state when server props update
  useEffect(() => {
    setArtigos(artigosIniciais)
  }, [artigosIniciais])
  const [busca, setBusca] = useState('')
  const [tagSelecionada, setTagSelecionada] = useState<string | null>(null)
  
  // Sub-aba ativa (artigos ou documentos)
  const [subTab, setSubTab] = useState<'artigos' | 'documentos'>('artigos')

  // Estados de documentos
  const [documentos, setDocumentos] = useState<DocumentoConhecimento[]>([])
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(false)
  const [documentoExclusao, setDocumentoExclusao] = useState<DocumentoConhecimento | null>(null)

  // Estados dos Modais
  const [modalAberto, setModalAberto] = useState(false)
  const [modalConfirmarExclusao, setModalConfirmarExclusao] = useState<Artigo | null>(null)
  const [artigoEdicao, setArtigoEdicao] = useState<Artigo | null>(null)

  // Estado do Formulário
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [ativo, setAtivo] = useState(true)

  // Estados de Operação / Loading
  const [isPending, startTransition] = useTransition()
  const [mensagemErro, setMensagemErro] = useState<string | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)

  // Helper para formatar o tamanho dos arquivos em formato amigável
  const formatarTamanho = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Carregar lista de documentos de conhecimento
  const carregarDocumentos = useCallback(async () => {
    setCarregandoDocumentos(true)
    try {
      const res = await listarDocumentosConhecimento()
      if (res.success && res.data) {
        setDocumentos(res.data)
      } else {
        console.error('Erro ao listar documentos:', res.error)
      }
    } catch (err) {
      console.error('Erro ao listar documentos:', err)
    } finally {
      setCarregandoDocumentos(false)
    }
  }, [])

  // Efeito para carregar documentos quando a aba for ativada
  useEffect(() => {
    if (subTab === 'documentos') {
      carregarDocumentos()
    }
  }, [subTab, carregarDocumentos])

  // Lógica de upload e conversão para base64
  const handleUploadDocumento = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]

    // Limite de tamanho de arquivo: 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert('O arquivo excede o limite de 10MB.')
      return
    }

    // Validar tipo de arquivo pelo tipo mime ou extensão
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.toLowerCase().endsWith('.docx')

    if (!isPDF && !isDocx) {
      alert('Formato de arquivo não suportado. Apenas PDF ou DOCX são permitidos.')
      return
    }

    // Validar limite total de 50 documentos
    if (documentos.length >= 50) {
      alert('Lote limite de 50 documentos atingido.')
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      const base64Data = base64.split(',')[1] // Remover o cabeçalho data:application/pdf;base64,...

      startTransition(async () => {
        try {
          const response = await importarDocumentoConhecimento(
            file.name,
            file.type || (isPDF ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
            base64Data
          )

          if (response.success) {
            await carregarDocumentos()
            // Atualiza os artigos no servidor para que os chunks apareçam
            router.refresh()
          } else {
            alert(`Erro ao importar documento: ${response.error}`)
          }
        } catch (err: any) {
          alert(`Erro ao importar documento: ${err.message || err}`)
        }
      })
    }
    reader.readAsDataURL(file)
  }

  // Lógica de exclusão de documento
  const handleConfirmarExclusaoDocumento = async () => {
    if (!documentoExclusao) return

    startTransition(async () => {
      try {
        const response = await excluirDocumentoConhecimento(documentoExclusao.id)
        if (response.success) {
          setDocumentos(prev => prev.filter(d => d.id !== documentoExclusao.id))
          setDocumentoExclusao(null)
          // Atualiza os artigos no servidor para remover os chunks deletados em cascata
          router.refresh()
        } else {
          alert(`Erro ao excluir documento: ${response.error}`)
        }
      } catch (err: any) {
        alert(`Erro ao excluir documento: ${err.message || err}`)
      }
    })
  }

  // Resetar formulário
  const resetarFormulario = () => {
    setTitulo('')
    setConteudo('')
    setTags([])
    setTagInput('')
    setAtivo(true)
    setArtigoEdicao(null)
    setMensagemErro(null)
  }

  // Abrir modal para criação
  const handleNovoArtigo = () => {
    resetarFormulario()
    setModalAberto(true)
  }

  // Abrir modal para edição
  const handleEditarArtigo = (artigo: Artigo) => {
    resetarFormulario()
    setArtigoEdicao(artigo)
    setTitulo(artigo.titulo)
    setConteudo(artigo.conteudo)
    setTags(artigo.tags || [])
    setAtivo(artigo.ativo)
    setModalAberto(true)
  }

  // Adicionar tag ao formulário
  const adicionarTag = () => {
    const tagLimpa = tagInput.trim().toLowerCase()
    if (tagLimpa && !tags.includes(tagLimpa)) {
      if (tagLimpa.length > 100) return
      setTags([...tags, tagLimpa])
      setTagInput('')
    }
  }

  // Capturar tecla no input de tag
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      adicionarTag()
    }
  }

  // Remover tag do formulário
  const removerTag = (tagParaRemover: string) => {
    setTags(tags.filter(t => t !== tagParaRemover))
  }

  // Enviar Formulário (Criar ou Editar)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMensagemErro(null)
    setMensagemSucesso(null)

    if (!titulo.trim()) {
      setMensagemErro('O título é obrigatório.')
      return
    }
    if (!conteudo.trim()) {
      setMensagemErro('O conteúdo é obrigatório.')
      return
    }

    startTransition(async () => {
      let response
      if (artigoEdicao) {
        response = await atualizarArtigo(artigoEdicao.id, titulo, conteudo, tags, ativo)
      } else {
        response = await criarArtigo(titulo, conteudo, tags, ativo)
      }

      if (response.success && response.data) {
        const artigoSalvo = response.data as Artigo
        
        if (artigoEdicao) {
          setArtigos(artigos.map(a => a.id === artigoSalvo.id ? artigoSalvo : a))
          setMensagemSucesso('Artigo atualizado com sucesso!')
        } else {
          setArtigos([artigoSalvo, ...artigos])
          setMensagemSucesso('Artigo criado com sucesso!')
        }

        setTimeout(() => {
          setModalAberto(false)
          resetarFormulario()
          setMensagemSucesso(null)
        }, 1200)
      } else {
        setMensagemErro(response.error || 'Ocorreu um erro ao salvar o artigo.')
      }
    })
  }

  // Alternar Status Ativo (Switch rápido)
  const handleAlternarStatus = async (artigo: Artigo) => {
    const novoStatus = !artigo.ativo

    // Atualização otimista no estado local
    setArtigos(prev => prev.map(a => a.id === artigo.id ? { ...a, ativo: novoStatus } : a))

    const response = await alternarStatusArtigo(artigo.id, novoStatus)

    if (!response.success) {
      // Reverter se der erro
      setArtigos(prev => prev.map(a => a.id === artigo.id ? { ...a, ativo: artigo.ativo } : a))
      alert(`Erro ao alterar o status: ${response.error}`)
    }
  }

  // Confirmar exclusão do artigo
  const handleConfirmarExclusao = async () => {
    if (!modalConfirmarExclusao) return

    startTransition(async () => {
      const response = await excluirArtigo(modalConfirmarExclusao.id)

      if (response.success) {
        setArtigos(artigos.filter(a => a.id !== modalConfirmarExclusao.id))
        setModalConfirmarExclusao(null)
      } else {
        alert(`Erro ao excluir artigo: ${response.error}`)
      }
    })
  }

  // Extrair todas as tags únicas dos artigos para filtro
  const todasTags = Array.from(
    new Set(artigos.flatMap(a => a.tags || []))
  ).sort()

  // Filtrar artigos para exibição
  const artigosFiltrados = artigos.filter(artigo => {
    const bateBusca = 
      artigo.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      artigo.conteudo.toLowerCase().includes(busca.toLowerCase())
    
    const bateTag = !tagSelecionada || artigo.tags?.includes(tagSelecionada)

    return bateBusca && bateTag
  })

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-50 p-6 overflow-y-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-amber-500" />
            Base de Conhecimento RAG
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gerencie as informações que alimentam as respostas automáticas da assistente virtual Sofía.
          </p>
        </div>

        {subTab === 'artigos' && (
          <button
            onClick={handleNovoArtigo}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-zinc-950 font-semibold rounded-lg shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all text-sm cursor-pointer select-none"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            Novo Artigo
          </button>
        )}
      </div>

      {/* Menu de Sub-abas */}
      <div className="flex gap-4 border-b border-zinc-800 pb-3 mb-6">
        <button
          onClick={() => setSubTab('artigos')}
          className={`pb-2 px-1 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            subTab === 'artigos'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Artigos Manuais
        </button>
        <button
          onClick={() => setSubTab('documentos')}
          className={`pb-2 px-1 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            subTab === 'documentos'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Documentos (PDF/DOCX)
        </button>
      </div>

      {subTab === 'documentos' ? (
        <div className="flex flex-col gap-6">
          {/* Card superior com uploader e contador */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-zinc-900/30 border border-zinc-800 p-6 rounded-xl">
            <div className="lg:col-span-2 flex flex-col justify-center">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-2">
                <UploadCloud className="h-5 w-5 text-amber-500" />
                Carregar Novo Documento
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                Envie arquivos no formato PDF ou DOCX. O sistema extrairá o texto bruto, dividirá em blocos de até 4000 caracteres e os associará à base de conhecimento da Sofía automaticamente.
              </p>
            </div>

            {/* Dropzone / Input de arquivo */}
            <div className="flex flex-col items-center justify-center">
              <label 
                className="w-full flex flex-col items-center justify-center px-4 py-6 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-zinc-800 hover:border-amber-500/50 rounded-xl cursor-pointer group transition-all duration-200"
              >
                <UploadCloud className="h-8 w-8 text-zinc-500 group-hover:text-amber-500 transition-colors mb-2" />
                <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors uppercase tracking-wider mb-1">
                  Selecionar Arquivo
                </span>
                <span className="text-[10px] text-zinc-600">
                  PDF ou DOCX até 10MB
                </span>
                <input 
                  type="file" 
                  accept=".pdf,.docx" 
                  onChange={handleUploadDocumento}
                  className="hidden" 
                  disabled={isPending}
                />
              </label>
              <div className="mt-3 flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-zinc-500" />
                <span className="text-xs text-zinc-400 font-medium">
                  {documentos.length}/50 documentos enviados
                </span>
              </div>
            </div>
          </div>

          {/* Listagem de documentos */}
          {carregandoDocumentos ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-amber-500 animate-spin mb-3" />
              <p className="text-sm text-zinc-400">Carregando lista de documentos...</p>
            </div>
          ) : documentos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
              <FileText className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-zinc-400 font-medium">Nenhum documento importado</p>
              <p className="text-xs text-zinc-600 mt-1">Carregue um arquivo PDF ou DOCX para popular a base de conhecimento.</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-zinc-800 rounded-xl bg-zinc-900/10">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Nome do Arquivo</th>
                    <th className="px-5 py-3.5">Tamanho</th>
                    <th className="px-5 py-3.5">Data de Envio</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-sm text-zinc-300 font-normal">
                  {documentos.map((doc) => (
                    <tr key={doc.id} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="px-5 py-4 font-medium text-zinc-200 flex items-center gap-3">
                        <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="truncate max-w-xs md:max-w-md xl:max-w-lg" title={doc.nome_arquivo}>
                          {doc.nome_arquivo}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-zinc-400 text-xs font-mono">
                        {formatarTamanho(doc.tamanho_bytes)}
                      </td>
                      <td className="px-5 py-4 text-zinc-400 text-xs">
                        <div className="flex items-center gap-1.5 pt-1">
                          <Calendar className="h-3.5 w-3.5 text-zinc-600" />
                          {doc.data_criacao ? new Date(doc.data_criacao).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setDocumentoExclusao(doc)}
                          className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded text-zinc-400 transition-all cursor-pointer"
                          title="Excluir Documento"
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filtros e Busca */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Campo de Busca */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar por título ou conteúdo..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all"
                />
                {busca && (
                  <button 
                    onClick={() => setBusca('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filtro de Tag Ativa */}
              {tagSelecionada && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg text-xs text-amber-400 font-medium">
                  <span>Filtrado por: #{tagSelecionada}</span>
                  <button 
                    onClick={() => setTagSelecionada(null)}
                    className="text-amber-400 hover:text-amber-300 ml-1 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Nuvem de tags simplificada para filtros rápidos */}
            {todasTags.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-zinc-500 flex items-center gap-1 mr-1">
                  <Tag className="h-3 w-3" /> Filtrar tag:
                </span>
                {todasTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTagSelecionada(tagSelecionada === tag ? null : tag)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-all cursor-pointer ${
                      tagSelecionada === tag
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800/80 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid de Artigos */}
          {artigosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
              <BookOpen className="h-10 w-10 text-zinc-600 animate-pulse mb-3" />
              <p className="text-zinc-400 font-medium">Nenhum artigo encontrado</p>
              <p className="text-xs text-zinc-600 mt-1">Experimente limpar a busca ou criar um novo artigo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {artigosFiltrados.map((artigo) => (
                <div
                  key={artigo.id}
                  className={`flex flex-col justify-between p-5 bg-zinc-900/40 hover:bg-zinc-900/90 border rounded-xl transition-all duration-200 ${
                    artigo.ativo 
                      ? 'border-zinc-800/80 hover:border-zinc-700' 
                      : 'border-zinc-900/50 opacity-60 hover:opacity-80'
                  }`}
                >
                  {/* Título e Tags */}
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-semibold text-zinc-100 hover:text-amber-400 transition-colors text-base line-clamp-1">
                        {artigo.titulo}
                      </h3>
                      
                      {/* Status Switch (Ativo) */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleAlternarStatus(artigo)}
                          title={artigo.ativo ? 'Desativar Artigo' : 'Ativar Artigo'}
                          className="text-zinc-400 hover:text-zinc-200 cursor-pointer focus:outline-none"
                        >
                          {artigo.ativo ? (
                            <ToggleRight className="h-6 w-6 text-amber-500" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-zinc-600" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Conteúdo */}
                    <p className="text-sm text-zinc-400 line-clamp-3 mb-4 font-normal leading-relaxed whitespace-pre-wrap">
                      {artigo.conteudo}
                    </p>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="flex items-center justify-between border-t border-zinc-800/60 pt-3 mt-1">
                    {/* Listagem de Tags */}
                    <div className="flex flex-wrap gap-1.5 max-w-[70%]">
                      {artigo.tags && artigo.tags.length > 0 ? (
                        artigo.tags.map(tag => (
                          <span 
                            key={tag} 
                            className="px-2 py-0.5 rounded bg-zinc-800/80 text-[10px] text-zinc-400 font-medium"
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-zinc-600 italic">sem tags</span>
                      )}
                    </div>

                    {/* Botões de Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditarArtigo(artigo)}
                        className="p-1.5 hover:bg-zinc-800 hover:text-amber-500 rounded text-zinc-400 transition-all cursor-pointer"
                        title="Editar Artigo"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setModalConfirmarExclusao(artigo)}
                        className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded text-zinc-400 transition-all cursor-pointer"
                        title="Excluir Artigo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Criar/Editar */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-500" />
                {artigoEdicao ? 'Editar Artigo de Conhecimento' : 'Novo Artigo de Conhecimento'}
              </h2>
              <button
                onClick={() => setModalAberto(false)}
                className="text-zinc-400 hover:text-zinc-200 rounded p-1 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Alertas */}
              {mensagemErro && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2.5 text-xs text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  <div>
                    <span className="font-semibold">Erro:</span> {mensagemErro}
                  </div>
                </div>
              )}

              {mensagemSucesso && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-2.5 text-xs text-emerald-400">
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    {mensagemSucesso}
                  </div>
                </div>
              )}

              {/* Título */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Título do Artigo <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Como funciona o sistema de rodízio"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm text-zinc-200 outline-none placeholder-zinc-600 transition-all"
                  maxLength={255}
                  required
                  disabled={isPending}
                />
              </div>

              {/* Conteúdo */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Conteúdo do Artigo <span className="text-amber-500">*</span>
                </label>
                <textarea
                  placeholder="Escreva aqui as informações detalhadas que a IA usará como contexto para responder..."
                  value={conteudo}
                  onChange={(e) => setConteudo(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm text-zinc-200 outline-none placeholder-zinc-600 transition-all resize-y font-sans leading-relaxed"
                  required
                  disabled={isPending}
                />
              </div>

              {/* Tags Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Tags (Palavras-chave)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Adicione tags (pressione Enter ou vírgula)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-lg text-sm text-zinc-200 outline-none placeholder-zinc-600 transition-all"
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    onClick={adicionarTag}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-lg transition-all text-sm cursor-pointer select-none"
                    disabled={isPending}
                  >
                    Adicionar
                  </button>
                </div>

                {/* Pills de Tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs text-amber-500 font-medium"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removerTag(tag)}
                          className="hover:text-red-400 text-zinc-500 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Ativo */}
              <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="h-4 w-4 rounded bg-zinc-900 border-zinc-800 text-amber-500 focus:ring-amber-500/50 accent-amber-500 cursor-pointer"
                  disabled={isPending}
                />
                <label 
                  htmlFor="ativo" 
                  className="text-xs font-semibold text-zinc-300 uppercase cursor-pointer select-none"
                >
                  Artigo Ativo (Visível para RAG)
                </label>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg transition-all text-sm cursor-pointer select-none"
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex items-center justify-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-zinc-950 font-semibold rounded-lg shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all text-sm cursor-pointer select-none"
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin text-zinc-950" />}
                {artigoEdicao ? 'Salvar Alterações' : 'Criar Artigo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão de Artigo */}
      {modalConfirmarExclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-lg font-bold text-zinc-100">Excluir Artigo?</h3>
              </div>
              
              <p className="text-sm text-zinc-400 leading-relaxed mb-2">
                Tem certeza que deseja excluir permanentemente o artigo:
              </p>
              
              <p className="text-sm font-semibold text-zinc-200 border-l-2 border-amber-500 pl-3 py-1 bg-zinc-950/50 rounded mb-4">
                {modalConfirmarExclusao.titulo}
              </p>

              <p className="text-xs text-zinc-500 leading-relaxed">
                Esta ação não poderá ser desfeita. A assistente virtual Sofía perderá imediatamente o acesso a este contexto de conhecimento.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalConfirmarExclusao(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg transition-all text-sm cursor-pointer select-none"
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusao}
                className="flex items-center justify-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-zinc-50 font-semibold rounded-lg transition-all text-sm cursor-pointer select-none"
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin text-zinc-50" />}
                Excluir Artigo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão de Documento */}
      {documentoExclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-lg font-bold text-zinc-100">Excluir Documento?</h3>
              </div>
              
              <p className="text-sm text-zinc-400 leading-relaxed mb-2">
                Tem certeza que deseja excluir permanentemente o documento:
              </p>
              
              <p className="text-sm font-semibold text-zinc-200 border-l-2 border-amber-500 pl-3 py-1 bg-zinc-950/50 rounded mb-4">
                {documentoExclusao.nome_arquivo}
              </p>

              <p className="text-xs text-zinc-500 leading-relaxed">
                Esta ação apagará o arquivo físico no storage e excluirá todos os blocos de texto associados a ele em cascata. A assistente virtual Sofía perderá imediatamente o acesso a esse conhecimento.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDocumentoExclusao(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg transition-all text-sm cursor-pointer select-none"
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoDocumento}
                className="flex items-center justify-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-zinc-50 font-semibold rounded-lg transition-all text-sm cursor-pointer select-none"
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin text-zinc-50" />}
                Excluir Documento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
