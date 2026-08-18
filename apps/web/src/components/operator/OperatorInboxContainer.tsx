'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { alternarSofiaGlobal, alternarSofiaWhatsApp, obterStatusSofiaAtendimento } from '@/app/actions/atendimento'
import type { SofiaAtendimentoStatus } from '@/app/actions/atendimento'
import type { SofiaGlobalChannel } from '@/lib/config/sistema'
import ConversationsQueue, { Conversa, Mensagem, Cliente, WhatsAppSofiaState } from './ConversationsQueue'
import OperatorChatConsole from './OperatorChatConsole'
import ClientCrmPanel from './ClientCrmPanel'
import SofiaGlobalStatusBar from './SofiaGlobalStatusBar'
import { notificationSound } from '@/lib/audio/notification-sound'

interface OperatorInboxContainerProps {
  conversasIniciais: Conversa[]
  initialSofiaStatus: SofiaAtendimentoStatus | null
}

export default function OperatorInboxContainer({
  conversasIniciais,
  initialSofiaStatus
}: OperatorInboxContainerProps) {
  const [conversas, setConversas] = useState<Conversa[]>(conversasIniciais)
  const [selectedConversaId, setSelectedConversaId] = useState<string | null>(
    conversasIniciais.length > 0 ? conversasIniciais[0].id : null
  )
  const [sofiaToggleConversaId, setSofiaToggleConversaId] = useState<string | null>(null)
  const [sofiaToggleError, setSofiaToggleError] = useState<string | null>(null)
  const [sofiaStatus, setSofiaStatus] = useState<SofiaAtendimentoStatus | null>(initialSofiaStatus)
  const [sofiaStatusError, setSofiaStatusError] = useState<string | null>(null)
  const [refreshingSofiaStatus, setRefreshingSofiaStatus] = useState(false)
  const [togglingGlobalChannel, setTogglingGlobalChannel] = useState<SofiaGlobalChannel | null>(null)

  // Encontra a conversa ativa correspondente ao id selecionado
  const activeConversa = conversas.find((c) => c.id === selectedConversaId) || null

  const mapWhatsAppSofiaState = useCallback((state: any): WhatsAppSofiaState | null => {
    if (!state) return null

    return {
      id: state.id,
      cliente_id: state.cliente_id ?? state.clienteId,
      canal: state.canal,
      sofia_dormindo: state.sofia_dormindo ?? state.sleeping,
      motivo: state.motivo ?? state.reason,
      origem: state.origem ?? state.source,
      alterado_por: state.alterado_por ?? state.actorUserId,
      data_criacao: state.data_criacao ?? state.createdAt,
      data_atualizacao: state.data_atualizacao ?? state.updatedAt,
    }
  }, [])

  const buscarEstadoSofiaWhatsApp = useCallback(async (clienteId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('whatsapp_sofia_states')
      .select('id, cliente_id, canal, sofia_dormindo, motivo, origem, alterado_por, data_criacao, data_atualizacao')
      .eq('cliente_id', clienteId)
      .eq('canal', 'whatsapp')
      .maybeSingle()

    if (error) {
      console.warn('Erro ao buscar estado WhatsApp Sofia:', error.message)
      return null
    }

    return mapWhatsAppSofiaState(data)
  }, [mapWhatsAppSofiaState])


  const refreshSofiaStatus = useCallback(async () => {
    setRefreshingSofiaStatus(true)
    setSofiaStatusError(null)

    const res = await obterStatusSofiaAtendimento()
    if (res.success && res.data) {
      setSofiaStatus(res.data)
    } else {
      setSofiaStatusError(`Erro ao atualizar status global da Sofia: ${res.error}`)
    }

    setRefreshingSofiaStatus(false)
  }, [])

  const handleToggleGlobalSofia = useCallback(async (channel: SofiaGlobalChannel, enabled: boolean) => {
    if (!sofiaStatus?.permissions.canToggleGlobalSofia) {
      setSofiaStatusError('Only admins and supervisors can change global Sofia status.')
      return
    }

    setTogglingGlobalChannel(channel)
    setSofiaStatusError(null)

    const res = await alternarSofiaGlobal(channel, enabled)
    if (res.success) {
      await refreshSofiaStatus()
    } else {
      setSofiaStatusError(`Erro ao alterar status global da Sofia: ${res.error}`)
    }

    setTogglingGlobalChannel(null)
  }, [refreshSofiaStatus, sofiaStatus?.permissions.canToggleGlobalSofia])

  // Busca do Supabase e atualiza o estado local de uma conversa específica (inclui join de clientes e mensagens)
  const buscarEAtualizarConversaCompleta = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
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
      .eq('id', id)
      .single()

    if (data && !error) {
      const whatsappSofiaState = await buscarEstadoSofiaWhatsApp((data as any).cliente_id)

      setConversas((prev) => {
        const existe = prev.some((c) => c.id === id)
        const conversaAtualizada = {
          ...data,
          // Ordena as mensagens cronologicamente antes de salvar no estado
          mensagens: [...(data.mensagens || [])].sort(
            (a, b) => new Date(a.data_criacao).getTime() - new Date(b.data_criacao).getTime()
          ),
          whatsapp_sofia_state: whatsappSofiaState
        } as unknown as Conversa

        if (existe) {
          return prev.map((c) => (c.id === id ? conversaAtualizada : c))
        }
        return [conversaAtualizada, ...prev]
      })
    }
  }, [buscarEstadoSofiaWhatsApp])

  // Ao montar, carrega as mensagens e detalhes de todas as conversas iniciais pré-carregadas pelo SSR
  useEffect(() => {
    conversasIniciais.forEach((c) => {
      buscarEAtualizarConversaCompleta(c.id)
    })
    if (!initialSofiaStatus) {
      refreshSofiaStatus()
    }
  }, [conversasIniciais, buscarEAtualizarConversaCompleta, initialSofiaStatus, refreshSofiaStatus])

  // Configuração da escuta em Tempo Real (Supabase Realtime)
  useEffect(() => {
    const supabase = createClient()

    const canal = supabase
      .channel('operator-atendimento-realtime')
      // Escutar novos inserts em mensagens
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens' },
        async (payload) => {
          const novaMsg = payload.new as Mensagem
          
          if (novaMsg.remetente === 'cliente') {
            if (typeof window !== 'undefined') {
              const somSalvo = localStorage.getItem('asados_notificacoes_som') !== 'false'
              if (somSalvo) {
                notificationSound.playChime()
              }
            }
          }
          
          setConversas((prevConversas) => {
            const conversaExiste = prevConversas.some((c) => c.id === novaMsg.conversa_id)

            if (!conversaExiste) {
              // Se a mensagem pertence a uma conversa ainda não mapeada, busca a conversa inteira
              buscarEAtualizarConversaCompleta(novaMsg.conversa_id)
              return prevConversas
            }

            return prevConversas.map((c) => {
              if (c.id === novaMsg.conversa_id) {
                const msgs = c.mensagens || []
                // Evita duplicidade se a mensagem já foi adicionada por ação direta
                if (msgs.some((m) => m.id === novaMsg.id)) {
                  return c
                }
                return {
                  ...c,
                  data_atualizacao: novaMsg.data_criacao,
                  mensagens: [...msgs, novaMsg].sort(
                    (a, b) => new Date(a.data_criacao).getTime() - new Date(b.data_criacao).getTime()
                  )
                }
              }
              return c
            })
          })
        }
      )
      // Escutar updates na tabela de conversas (mudança de status, ativação/desativação de IA)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversas' },
        async (payload) => {
          const conversaAlt = payload.new as Conversa
          
          setConversas((prevConversas) => {
            const existe = prevConversas.some((c) => c.id === conversaAlt.id)
            if (existe) {
              return prevConversas.map((c) => {
                if (c.id === conversaAlt.id) {
                  return {
                    ...c,
                    status: conversaAlt.status,
                    ia_ativa: conversaAlt.ia_ativa,
                    data_atualizacao: conversaAlt.data_atualizacao
                  }
                }
                return c
              })
            } else {
              // Se a conversa foi reaberta ou é nova, busca do Supabase para atualizar a fila
              buscarEAtualizarConversaCompleta(conversaAlt.id)
              return prevConversas
            }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sofia_states' },
        async (payload) => {
          const statePayload = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as any
          const clienteId = statePayload?.cliente_id
          if (!clienteId) return

          const refreshedState = payload.eventType === 'DELETE'
            ? null
            : mapWhatsAppSofiaState(statePayload)

          setConversas((prev) =>
            prev.map((conversa) =>
              conversa.cliente_id === clienteId
                ? { ...conversa, whatsapp_sofia_state: refreshedState }
                : conversa
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [buscarEAtualizarConversaCompleta, mapWhatsAppSofiaState])

  // Callback de alteração de conversa selecionada
  const handleSelectConversa = (id: string) => {
    setSelectedConversaId(id)
    // Atualiza os dados no momento da seleção para evitar mensagens defasadas
    buscarEAtualizarConversaCompleta(id)
  }

  // Atualização local no estado ao alternar IA no console
  const handleConversaUpdated = (
    conversaId: string,
    iaAtiva: boolean,
    status: 'ia_atendendo' | 'aberta' | 'fechada'
  ) => {
    setConversas((prev) =>
      prev.map((c) =>
        c.id === conversaId
          ? {
              ...c,
              ia_ativa: iaAtiva,
              status,
              data_atualizacao: new Date().toISOString()
            }
          : c
      )
    )
  }

  const handleToggleSofiaSleep = async (conversa: Conversa, dormir: boolean) => {
    setSofiaToggleConversaId(conversa.id)
    setSofiaToggleError(null)

    const res = await alternarSofiaWhatsApp(conversa.cliente_id, dormir, conversa.id)

    if (res.success) {
      const nextState = mapWhatsAppSofiaState(res.state)
      setConversas((prev) =>
        prev.map((item) => {
          if (item.cliente_id !== conversa.cliente_id) return item

          return {
            ...item,
            whatsapp_sofia_state: nextState,
            ia_ativa: dormir && item.id === conversa.id ? false : item.ia_ativa,
            status: dormir && item.id === conversa.id ? 'aberta' : item.status,
            data_atualizacao: item.id === conversa.id ? new Date().toISOString() : item.data_atualizacao,
          }
        })
      )
    } else {
      setSofiaToggleError(`Erro ao alterar Sofía WhatsApp: ${res.error}`)
    }

    setSofiaToggleConversaId(null)
  }

  // Atualização local no estado ao enviar mensagem
  const handleMensagemEnviada = (conversaId: string, mensagem: Mensagem) => {
    setConversas((prev) =>
      prev.map((c) => {
        if (c.id === conversaId) {
          const msgs = c.mensagens || []
          if (msgs.some((m) => m.id === mensagem.id)) return c
          return {
            ...c,
            data_atualizacao: message_data_criacao(mensagem),
            mensagens: [...msgs, mensagem].sort(
              (a, b) => new Date(a.data_criacao).getTime() - new Date(b.data_criacao).getTime()
            )
          }
        }
        return c
      })
    )
  }

  function message_data_criacao(mensagem: Mensagem) {
    return mensagem.data_criacao
  }

  // Atualização local no estado ao salvar CRM do cliente
  const handleClienteUpdated = (clienteId: string, updatedFields: Partial<Cliente>) => {
    setConversas((prev) =>
      prev.map((c) => {
        if (c.clientes && c.clientes.id === clienteId) {
          return {
            ...c,
            clientes: {
              ...c.clientes,
              ...updatedFields
            }
          }
        }
        return c
      })
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
      {sofiaStatus && (
        <SofiaGlobalStatusBar
          status={sofiaStatus}
          refreshing={refreshingSofiaStatus}
          togglingChannel={togglingGlobalChannel}
          error={sofiaStatusError}
          onToggleChannel={handleToggleGlobalSofia}
          onRefresh={refreshSofiaStatus}
        />
      )}

      <div className="flex min-h-0 flex-1 w-full overflow-hidden">
      {/* Lista lateral de conversas */}
      <div className="w-80 md:w-96 shrink-0 h-full overflow-hidden">
        {sofiaToggleError && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {sofiaToggleError}
          </div>
        )}
        <ConversationsQueue
          conversas={conversas}
          selectedConversaId={selectedConversaId}
          onSelectConversa={handleSelectConversa}
          onToggleSofiaSleep={handleToggleSofiaSleep}
          sofiaToggleConversaId={sofiaToggleConversaId}
        />
      </div>

      {/* Console ativo de conversa */}
      <div className="flex-1 h-full overflow-hidden">
        <OperatorChatConsole
          conversa={activeConversa}
          onConversaUpdated={handleConversaUpdated}
          onMensagemEnviada={handleMensagemEnviada}
        />
      </div>

      {/* Painel lateral de CRM */}
      <ClientCrmPanel
        cliente={activeConversa?.clientes || null}
        onClienteUpdated={handleClienteUpdated}
      />
      </div>
    </div>
  )
}
