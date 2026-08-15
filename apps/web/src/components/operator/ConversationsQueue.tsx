'use client'

import React from 'react'
import { MessageSquare, Bot, UserCheck, Inbox, PauseCircle, PlayCircle, Loader2 } from 'lucide-react'

export interface Cliente {
  id: string
  nome: string
  telefone: string
  endereco?: string | null
  tags?: string[]
  notas?: string | null
  score?: number
}

export interface WhatsAppSofiaState {
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

export interface Mensagem {
  id: string;
  conversa_id: string;
  remetente: 'cliente' | 'operador' | 'ia';
  conteudo: string | null;
  url_anexo: string | null;
  data_criacao: string;
}

export interface Conversa {
  id: string
  cliente_id: string
  status: 'ia_atendendo' | 'aberta' | 'fechada'
  ia_ativa: boolean
  data_criacao: string
  data_atualizacao: string
  clientes: Cliente | null
  mensagens?: Mensagem[]
  whatsapp_sofia_state?: WhatsAppSofiaState | null
}

interface ConversationsQueueProps {
  conversas: Conversa[]
  selectedConversaId: string | null
  onSelectConversa: (id: string) => void
  onToggleSofiaSleep?: (conversa: Conversa, dormir: boolean) => Promise<void>
  sofiaToggleConversaId?: string | null
}

type TabType = 'ia' | 'humano' | 'fechada'

export default function ConversationsQueue({
  conversas,
  selectedConversaId,
  onSelectConversa,
  onToggleSofiaSleep,
  sofiaToggleConversaId
}: ConversationsQueueProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>('ia')

  // Formata data e hora de atualização para exibição no card
  const formatarDataHora = (isoString: string) => {
    if (!isoString) return ''
    const data = new Date(isoString)
    const hoje = new Date()
    if (data.toDateString() === hoje.toDateString()) {
      return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  // Formata o número de telefone de Curitiba para exibição legível
  const formatarTelefone = (tel: string) => {
    if (!tel) return ''
    if (tel.startsWith('55') && tel.length === 13) {
      return `+55 (${tel.substring(2, 4)}) ${tel.substring(4, 9)}-${tel.substring(9)}`
    }
    return tel
  }

  // Retorna um fragmento estilizado da última mensagem
  const obterUltimaMensagem = (conversa: Conversa) => {
    const msgs = conversa.mensagens || []
    if (msgs.length === 0) return 'Nenhuma mensagem'
    const ultima = msgs[msgs.length - 1]
    const remetentePrefixo = 
      ultima.remetente === 'operador' ? 'Você: ' : 
      ultima.remetente === 'ia' ? 'Sofía: ' : ''
    
    if (ultima.conteudo) {
      return `${remetentePrefixo}${ultima.conteudo}`
    } else if (ultima.url_anexo) {
      return `${remetentePrefixo}📎 Anexo`
    }
    return 'Nenhuma mensagem'
  }

  // Heurística para contar mensagens não respondidas pelo operador ou IA
  const obterNaoLidasCount = (conversa: Conversa) => {
    if (conversa.id === selectedConversaId) return 0
    const msgs = conversa.mensagens || []
    if (msgs.length === 0) return 0

    let ultimoIndexAtendimento = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].remetente === 'operador' || msgs[i].remetente === 'ia') {
        ultimoIndexAtendimento = i
        break
      }
    }

    let count = 0
    for (let i = ultimoIndexAtendimento + 1; i < msgs.length; i++) {
      if (msgs[i].remetente === 'cliente') {
        count++
      }
    }
    return count
  }

  const isWhatsAppCustomer = (conversa: Conversa) => {
    const telefone = conversa.clientes?.telefone
    return typeof telefone === 'string' && /^55419[0-9]{8}$/.test(telefone)
  }

  // Filtra as conversas com base na aba selecionada
  const conversasFiltradas = conversas.filter((c) => {
    if (activeTab === 'ia') {
      return c.ia_ativa && c.status === 'ia_atendendo'
    } else if (activeTab === 'humano') {
      return !c.ia_ativa && c.status === 'aberta'
    } else {
      return c.status === 'fechada'
    }
  })

  // Ordena de forma decrescente pela última atualização
  const conversasOrdenadas = [...conversasFiltradas].sort((a, b) => {
    const dateA = new Date(a.data_atualizacao || a.data_criacao).getTime()
    const dateB = new Date(b.data_atualizacao || b.data_criacao).getTime()
    return dateB - dateA
  })

  return (
    <div className="flex h-full w-full flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Abas de Filtros Rápidos */}
      <div className="grid grid-cols-3 border-b border-zinc-800 bg-zinc-900/30 p-1">
        <button
          onClick={() => setActiveTab('ia')}
          className={`flex flex-col items-center justify-center py-2.5 text-xs font-medium rounded transition-all gap-1 cursor-pointer ${
            activeTab === 'ia'
              ? 'bg-zinc-800 text-amber-500 shadow-sm border border-zinc-700/50'
              : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
          }`}
        >
          <Bot className="h-4 w-4" />
          <span>Fila IA</span>
        </button>
        <button
          onClick={() => setActiveTab('humano')}
          className={`flex flex-col items-center justify-center py-2.5 text-xs font-medium rounded transition-all gap-1 cursor-pointer ${
            activeTab === 'humano'
              ? 'bg-zinc-800 text-amber-500 shadow-sm border border-zinc-700/50'
              : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Fila Humana</span>
        </button>
        <button
          onClick={() => setActiveTab('fechada')}
          className={`flex flex-col items-center justify-center py-2.5 text-xs font-medium rounded transition-all gap-1 cursor-pointer ${
            activeTab === 'fechada'
              ? 'bg-zinc-800 text-amber-500 shadow-sm border border-zinc-700/50'
              : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
          }`}
        >
          <Inbox className="h-4 w-4" />
          <span>Fechadas</span>
        </button>
      </div>

      {/* Fila de Cards de Conversa */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {conversasOrdenadas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <MessageSquare className="h-8 w-8 mb-2 stroke-zinc-600 animate-pulse" />
            <p className="text-xs">Nenhum atendimento nesta fila</p>
          </div>
        ) : (
          conversasOrdenadas.map((conversa) => {
            const isSelected = conversa.id === selectedConversaId
            const naoLidas = obterNaoLidasCount(conversa)
            const ultimaMsg = obterUltimaMensagem(conversa)

            return (
              <div
                key={conversa.id}
                onClick={() => onSelectConversa(conversa.id)}
                className={`relative flex flex-col p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-900 border-amber-500/50 shadow-md shadow-amber-500/5'
                    : 'bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700/80'
                }`}
              >
                {/* Nome do Cliente e Data */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-medium text-sm text-zinc-100 truncate max-w-[70%]">
                    {conversa.clientes?.nome || 'Cliente Sem Nome'}
                  </span>
                  <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                    {formatarDataHora(conversa.data_atualizacao || conversa.data_criacao)}
                  </span>
                </div>

                {/* Telefone Formatado */}
                {conversa.clientes?.telefone && (
                  <span className="text-xs text-zinc-500 font-mono mb-2 block">
                    {formatarTelefone(conversa.clientes.telefone)}
                  </span>
                )}

                {isWhatsAppCustomer(conversa) && (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium border ${
                        conversa.whatsapp_sofia_state?.sofia_dormindo
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}
                    >
                      {conversa.whatsapp_sofia_state?.sofia_dormindo ? 'Human handling' : 'Sofía awake'}
                    </span>
                    {onToggleSofiaSleep && conversa.status !== 'fechada' && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleSofiaSleep(conversa, !conversa.whatsapp_sofia_state?.sofia_dormindo)
                        }}
                        disabled={sofiaToggleConversaId === conversa.id}
                        className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sofiaToggleConversaId === conversa.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : conversa.whatsapp_sofia_state?.sofia_dormindo ? (
                          <PlayCircle className="h-3 w-3" />
                        ) : (
                          <PauseCircle className="h-3 w-3" />
                        )}
                        {conversa.whatsapp_sofia_state?.sofia_dormindo ? 'Wake' : 'Sleep'}
                      </button>
                    )}
                  </div>
                )}

                {/* Snippet da Última Mensagem */}
                <p className="text-xs text-zinc-400 line-clamp-1 pr-6">
                  {ultimaMsg}
                </p>

                {/* Badge de Mensagens Não Lidas */}
                {naoLidas > 0 && (
                  <span className="absolute bottom-4 right-4 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950 animate-bounce">
                    {naoLidas}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
