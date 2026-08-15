'use client'

import React, { useState, useEffect } from 'react'
import { User, Tag, FileText, MapPin, Plus, X, Save, Loader2, Star } from 'lucide-react'
import { atualizarClienteCrm } from '@/app/actions/clientes'
import { Cliente } from './ConversationsQueue'

interface ClientCrmPanelProps {
  cliente: Cliente | null
  onClienteUpdated?: (clienteId: string, updatedData: Partial<Cliente>) => void
}

export default function ClientCrmPanel({
  cliente,
  onClienteUpdated
}: ClientCrmPanelProps) {
  const [endereco, setEndereco] = useState('')
  const [notas, setNotas] = useState('')
  const [score, setScore] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Sincroniza o estado interno sempre que o cliente selecionado muda
  useEffect(() => {
    if (cliente) {
      setEndereco(cliente.endereco || '')
      setNotas(cliente.notas || '')
      setScore(cliente.score || 0)
      setTags(cliente.tags || [])
      setNewTag('')
      setSuccessMsg(null)
      setErrorMsg(null)
    }
  }, [cliente])

  if (!cliente) {
    return (
      <div className="flex h-full w-80 flex-col items-center justify-center border-l border-zinc-800 bg-zinc-950/20 text-zinc-500 p-6 text-center">
        <User className="h-12 w-12 mb-3 stroke-zinc-700 animate-pulse" />
        <p className="text-sm">Selecione uma conversa para ver as informações de CRM do cliente</p>
      </div>
    )
  }

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleSave = async () => {
    setLoading(true)
    setSuccessMsg(null)
    setErrorMsg(null)

    try {
      const res = await atualizarClienteCrm(cliente.id, {
        endereco: endereco.trim(),
        notas: notas.trim(),
        score,
        tags
      })

      if (res.success) {
        setSuccessMsg('Alterações salvas com sucesso!')
        if (onClienteUpdated) {
          onClienteUpdated(cliente.id, {
            endereco: endereco.trim(),
            notas: notas.trim(),
            score,
            tags
          })
        }
        // Limpar mensagem de sucesso após 3 segundos
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg(res.error || 'Erro ao salvar alterações.')
      }
    } catch (err: any) {
      console.error('Erro ao salvar CRM:', err)
      setErrorMsg('Erro inesperado ao salvar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-80 shrink-0 h-full border-l border-zinc-800 bg-zinc-950 flex flex-col">
      {/* Cabeçalho */}
      <div className="flex h-16 items-center border-b border-zinc-800 bg-zinc-900/40 px-6 shrink-0">
        <span className="font-semibold text-zinc-100 flex items-center gap-2 text-sm uppercase tracking-wider">
          <User className="h-4 w-4 text-amber-500" />
          CRM do Cliente
        </span>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Informações Básicas */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Dados Gerais</h3>
          <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4 space-y-2">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Nome</div>
              <div className="text-sm font-medium text-zinc-100">{cliente.nome}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Telefone</div>
              <div className="text-sm font-mono text-zinc-300">
                {cliente.telefone.startsWith('55') && cliente.telefone.length === 13
                  ? `+55 (${cliente.telefone.substring(2, 4)}) ${cliente.telefone.substring(4, 9)}-${cliente.telefone.substring(9)}`
                  : cliente.telefone}
              </div>
            </div>
          </div>
        </div>

        {/* Score */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-zinc-400" />
            Classificação (Score)
          </h3>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setScore(star)}
                className="focus:outline-none transition-transform active:scale-95 cursor-pointer"
              >
                <Star
                  className={`h-6 w-6 transition-colors ${
                    star <= score
                      ? 'fill-amber-500 stroke-amber-500'
                      : 'stroke-zinc-600 hover:stroke-zinc-500'
                  }`}
                />
              </button>
            ))}
            <span className="text-xs text-zinc-500 ml-2">Nota: {score}/5</span>
          </div>
        </div>

        {/* Endereço */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-zinc-400" />
            Endereço de Entrega
          </h3>
          <textarea
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            placeholder="Nenhum endereço cadastrado"
            rows={3}
            className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none resize-none transition-colors"
          />
        </div>

        {/* Tags */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-zinc-400" />
            Tags / Marcadores
          </h3>
          
          {/* Pills de Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.length === 0 ? (
              <span className="text-xs text-zinc-600 italic">Sem tags associadas</span>
            ) : (
              tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-500"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:bg-amber-500/20 rounded p-0.5 transition-colors focus:outline-none cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Adicionar Tag */}
          <form onSubmit={handleAddTag} className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Nova tag..."
              className="flex-1 text-xs rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-1.5 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!newTag.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/50 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Notas */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            Notas Internas (Atendimento)
          </h3>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observações importantes sobre o cliente, preferências, restrições alimentares..."
            rows={5}
            className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none resize-none transition-colors"
          />
        </div>

        {/* Feedback de Ação */}
        {successMsg && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400 text-center animate-pulse">
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 text-center">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Botão de Ação Inferior */}
      <div className="border-t border-zinc-800 bg-zinc-900/20 p-4 shrink-0">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="w-full flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-500 font-semibold text-zinc-950 transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-amber-500/10 text-sm"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Alterações
        </button>
      </div>
    </div>
  )
}
