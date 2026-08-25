'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  Send,
  Bot,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Edit3,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Eye,
  Download,
} from 'lucide-react'
import { alternarIaConversa, enviarMensagemOperador } from '@/app/actions/atendimento'
import { Conversa, Mensagem } from './ConversationsQueue'
import CreateOrderModal from './CreateOrderModal'
import { createClient } from '@/lib/supabase/client'
import ModalVisualizadorComprovante from '@/components/comprovantes/ModalVisualizadorComprovante'

function AttachmentCard({
  urlArquivo,
  onVisualizar,
}: {
  urlArquivo: string
  onVisualizar: (url: string, nome: string) => void
}) {
  const [downloading, setDownloading] = useState(false)
  const isPdf = urlArquivo.toLowerCase().includes('.pdf') || urlArquivo.toLowerCase().endsWith('.pdf')
  const fileName = urlArquivo.split('/').pop() || 'comprovante'

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDownloading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from('chat-midias')
        .createSignedUrl(urlArquivo, 3600)

      if (error || !data?.signedUrl) throw error || new Error('Falha ao gerar link')

      const res = await fetch(data.signedUrl)
      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Erro ao baixar anexo:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mt-2.5 rounded-2xl border border-zinc-700/80 bg-zinc-950/80 p-3 text-xs text-zinc-200 shadow-md space-y-2.5 max-w-sm">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
          {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300 border border-amber-500/30">
              {isPdf ? 'PDF' : 'IMAGEM'}
            </span>
            <span className="truncate text-xs font-bold text-zinc-100">{fileName}</span>
          </div>
          <span className="text-[10px] text-zinc-400">Comprovante de pagamento</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={() => onVisualizar(urlArquivo, fileName)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Visualizar</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80 text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>Baixar</span>
        </button>
      </div>
    </div>
  )
}

interface OperatorChatConsoleProps {
  conversa: Conversa | null
  onConversaUpdated?: (conversaId: string, iaAtiva: boolean, status: 'ia_atendendo' | 'aberta' | 'fechada') => void
  onMensagemEnviada?: (conversaId: string, mensagem: Mensagem) => void
}

export default function OperatorChatConsole({
  conversa,
  onConversaUpdated,
  onMensagemEnviada
}: OperatorChatConsoleProps) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [iaAlternando, setIaAlternando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [comprovanteModal, setComprovanteModal] = useState<{
    isOpen: boolean
    urlArquivo: string | null
    nomeArquivo?: string
  }>({
    isOpen: false,
    urlArquivo: null,
  })

  const handleAbrirVisualizador = (urlArquivo: string, nomeArquivo?: string) => {
    setComprovanteModal({
      isOpen: true,
      urlArquivo,
      nomeArquivo: nomeArquivo || urlArquivo.split('/').pop() || 'comprovante.pdf',
    })
  }
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Rolagem automática suave para a última mensagem
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Faz a rolagem sempre que a conversa ativa muda ou novas mensagens chegam
  useEffect(() => {
    scrollToBottom()
  }, [conversa?.id, conversa?.mensagens?.length])

  if (!conversa) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-950/20 text-zinc-500">
        <Bot className="h-12 w-12 mb-3 stroke-zinc-700 animate-pulse" />
        <p className="text-sm">Selecione uma conversa para iniciar o atendimento</p>
      </div>
    )
  }

  const { clientes, status, ia_ativa, mensagens = [] } = conversa

  // Verifica se a janela de 24 horas para mensagens WhatsApp expirou
  const verificarJanelaExcedida = () => {
    const telefone = clientes?.telefone
    const regexCuritiba = /^55419[0-9]{8}$/
    const possuiTelefoneCuritiba = typeof telefone === 'string' && regexCuritiba.test(telefone)

    // Clientes exclusivos de Web não possuem restrição de janela de 24h
    if (!possuiTelefoneCuritiba) {
      return false
    }

    // Busca a última mensagem enviada pelo cliente
    const ultMsgCliente = [...mensagens].reverse().find((m) => m.remetente === 'cliente')
    
    if (!ultMsgCliente) {
      return true
    }

    const dataUltMsg = new Date(ultMsgCliente.data_criacao).getTime()
    const agora = Date.now()
    const vinteQuatroHorasMs = 24 * 60 * 60 * 1000

    return (agora - dataUltMsg) > vinteQuatroHorasMs
  }

  const janelaExcedida = verificarJanelaExcedida()
  const isWhatsAppCustomer = typeof clientes?.telefone === 'string' && /^55419[0-9]{8}$/.test(clientes.telefone)
  const sofiaSleeping = conversa.whatsapp_sofia_state?.sofia_dormindo === true

  // Alterna o estado da IA na conversa
  const handleToggleIa = async () => {
    setIaAlternando(true)
    setErroEnvio(null)
    const novoEstadoIa = !ia_ativa
    
    const res = await alternarIaConversa(conversa.id, novoEstadoIa)
    if (res.success) {
      const novoStatus = novoEstadoIa ? 'ia_atendendo' : 'aberta'
      if (onConversaUpdated) {
        onConversaUpdated(conversa.id, novoEstadoIa, novoStatus)
      }
    } else {
      setErroEnvio(`Erro ao alterar IA: ${res.error}`)
    }
    setIaAlternando(false)
  }

  // Envia a mensagem digitada pelo operador
  const handleEnviar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!texto.trim() || status === 'fechada' || enviando) return

    setEnviando(true)
    setErroEnvio(null)

    const res = await enviarMensagemOperador(conversa.id, texto.trim())
    if (res.success) {
      setTexto('')
      // Se for inserido direto na web, pode notificar o parent imediatamente
      if (res.mensagem && onMensagemEnviada) {
        onMensagemEnviada(conversa.id, res.mensagem)
      }
    } else {
      if (res.error === 'JANELA_24H_EXCEDIDA') {
        setErroEnvio('A janela de 24 horas do WhatsApp foi excedida. O cliente precisa enviar uma nova mensagem.')
      } else {
        setErroEnvio(`Erro ao enviar mensagem: ${res.error}`)
      }
    }
    setEnviando(false)
  }

  // Envia com Enter (sem shift)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  // Formata hora de envio da mensagem
  const formatarDataMsg = (isoString: string) => {
    if (!isoString) return ''
    const data = new Date(isoString)
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900/10">
      {/* Cabeçalho do Chat */}
      <div className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-6 shrink-0">
        <div className="flex flex-col">
          <span className="font-semibold text-zinc-100">{clientes?.nome || 'Cliente Sem Nome'}</span>
          {clientes?.telefone && (
            <span className="text-xs text-zinc-500 font-mono">
              {clientes.telefone.startsWith('55') && clientes.telefone.length === 13
                ? `+55 (${clientes.telefone.substring(2, 4)}) ${clientes.telefone.substring(4, 9)}-${clientes.telefone.substring(9)}`
                : clientes.telefone}
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Status Visual */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">Fila:</span>
            {status === 'fechada' ? (
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700/50">
                Fechada
              </span>
            ) : status === 'ia_atendendo' ? (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500 border border-amber-500/20">
                IA Atendendo
              </span>
            ) : (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                Operador Humano
              </span>
            )}
          </div>

          {isWhatsAppCustomer && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">Sofía:</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-medium border ${
                  sofiaSleeping
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                }`}
              >
                {sofiaSleeping ? 'Human handling' : 'Awake'}
              </span>
            </div>
          )}

          {/* Botão Criar Pedido */}
          {status !== 'fechada' && (
            <button
              type="button"
              onClick={() => setIsOrderModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-zinc-950 hover:bg-amber-600 active:scale-95 transition-all shadow-md shadow-amber-500/10 cursor-pointer shrink-0"
            >
              Criar Pedido
            </button>
          )}

          {/* Toggle IA Ativa */}
          {status !== 'fechada' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-300">IA Ativa</span>
              <button
                type="button"
                onClick={handleToggleIa}
                disabled={iaAlternando}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  ia_ativa ? 'bg-amber-500' : 'bg-zinc-700'
                } ${iaAlternando ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="sr-only">Alternar IA</span>
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-zinc-950 shadow ring-0 transition duration-200 ease-in-out ${
                    ia_ativa ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              {iaAlternando && <Loader2 className="h-3 w-3 animate-spin text-amber-500" />}
            </div>
          )}
        </div>
      </div>

      {/* Banner de Prioridade (Pendente em Vermelho / Resolvido em Verde) */}
      {(() => {
        let indexSolicitacao = -1
        let tipoDetectado: 'cancelamento' | 'alteracao' | 'comprovante' | null = null

        for (let i = mensagens.length - 1; i >= 0; i--) {
          const m = mensagens[i]
          if (m.remetente === 'cliente' && m.conteudo) {
            const txt = m.conteudo.toLowerCase()
            if (txt.includes('cancelar') || txt.includes('cancelamento') || txt.includes('cancela') || txt.includes('queria cancelar')) {
              indexSolicitacao = i
              tipoDetectado = 'cancelamento'
              break
            }
            if (
              txt.includes('alterar pedido') ||
              txt.includes('modificar pedido') ||
              txt.includes('mudar pedido') ||
              txt.includes('mudar horário') ||
              txt.includes('mudar horario') ||
              txt.includes('trocar item') ||
              txt.includes('trocar pedido') ||
              txt.includes('alterar item') ||
              txt.includes('remover item') ||
              txt.includes('adicionar item') ||
              txt.includes('queria mudar')
            ) {
              indexSolicitacao = i
              tipoDetectado = 'alteracao'
              break
            }
            if (
              txt.includes('comprovante') ||
              txt.includes('comprovante de pagamento') ||
              txt.includes('comprovante pix') ||
              m.url_anexo
            ) {
              indexSolicitacao = i
              tipoDetectado = 'comprovante'
              break
            }
          }
        }

        if (!tipoDetectado || indexSolicitacao === -1) return null

        let resolvido = false
        for (let j = indexSolicitacao + 1; j < mensagens.length; j++) {
          const mPosterior = mensagens[j]
          if (mPosterior.remetente === 'operador') {
            resolvido = true
            break
          }
          if (mPosterior.conteudo) {
            const cLower = mPosterior.conteudo.toLowerCase()
            if (
              cLower.includes('atualizado no balcão') ||
              cLower.includes('pedido confirmado') ||
              cLower.includes('pedido cancelado') ||
              cLower.includes('cancelado pelo atendimento') ||
              cLower.includes('conforme combinado') ||
              cLower.includes('pagamento aprovado') ||
              cLower.includes('comprovante validado') ||
              cLower.includes('pagamento confirmado')
            ) {
              resolvido = true
              break
            }
          }
        }

        if (resolvido) {
          return (
            <div className="mx-6 mt-3 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-zinc-900 to-emerald-950/40 border border-emerald-500/60 p-3.5 text-xs text-emerald-200 shadow-xl shadow-emerald-950/40 shrink-0">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-emerald-300 font-black tracking-wide uppercase text-[11px]">
                    ✅ SOLICITAÇÃO RESOLVIDA & CONFIRMADA
                  </strong>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {tipoDetectado === 'cancelamento'
                      ? 'Cancelamento Atendido'
                      : tipoDetectado === 'comprovante'
                      ? 'Comprovante Validado & Pago'
                      : 'Alteração de Pedido Concluída'}
                  </span>
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed">
                  {tipoDetectado === 'cancelamento'
                    ? 'A solicitação de cancelamento foi tratada e confirmada pelo atendimento com o cliente.'
                    : tipoDetectado === 'comprovante'
                    ? 'O comprovante enviado pelo cliente foi revisado e o pagamento foi aprovado com sucesso.'
                    : 'A alteração dos componentes/horário do pedido foi salva e notificada com sucesso ao cliente.'}
                </p>
              </div>
            </div>
          )
        }

        return (
          <div className="mx-6 mt-3 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-red-950/90 via-zinc-900 to-amber-950/40 border border-red-500/60 p-3.5 text-xs text-red-200 shadow-xl shadow-red-950/40 shrink-0 animate-pulse">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-red-300 font-black tracking-wide uppercase text-[11px]">
                  🚨 ATENDIMENTO PRIORITÁRIO PENDENTE
                </strong>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                  {tipoDetectado === 'cancelamento'
                    ? 'Cancelamento Solicitado'
                    : tipoDetectado === 'comprovante'
                    ? 'Comprovante de Pagamento Anexado'
                    : 'Alteração de Itens/Horário'}
                </span>
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed">
                {tipoDetectado === 'cancelamento'
                  ? 'O cliente solicitou o cancelamento do pedido. Responda com cordialidade e proceda com o cancelamento ou verificação no painel de pedidos ao lado.'
                  : tipoDetectado === 'comprovante'
                  ? 'O cliente enviou o comprovante em PDF/imagem. Abra o documento anexo na conversa, confira o valor e confirme a aprovação do pedido ao lado.'
                  : 'O cliente solicitou ajuste nos itens ou no horário do pedido. Você pode editar os componentes e recalcular o total ao vivo na aba lateral de Pedidos Realizados.'}
              </p>

              {tipoDetectado === 'comprovante' && (() => {
                const anexoRecente = mensagens.slice().reverse().find((m) => m.url_anexo)?.url_anexo
                if (!anexoRecente) return null
                const nomeRecente = anexoRecente.split('/').pop() || 'comprovante.pdf'
                return (
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAbrirVisualizador(anexoRecente, nomeRecente)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Visualizar Comprovante Anexo</span>
                    </button>
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {/* Histórico Cronológico de Mensagens */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {mensagens.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-zinc-500 space-y-2">
            <Bot className="h-10 w-10 text-zinc-800" />
            <p className="text-xs">Nenhuma mensagem registrada nesta conversa.</p>
          </div>
        ) : (
          mensagens.map((msg) => {
            const isOperador = msg.remetente === 'operador'
            const isIA = msg.remetente === 'ia'

            return (
              <div
                key={msg.id}
                className={`flex w-full ${isOperador ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-all duration-200 ${
                    isOperador
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-zinc-950 rounded-tr-none'
                      : isIA
                      ? 'bg-zinc-900 border border-amber-500/20 text-zinc-100 rounded-tl-none relative shadow-md'
                      : 'bg-zinc-800 text-zinc-100 rounded-tl-none'
                  }`}
                >
                  {isIA && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-500 mb-1 select-none">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      <span>Sofía AI</span>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap leading-relaxed break-words">{msg.conteudo}</p>
                  
                  {msg.url_anexo && (
                    <AttachmentCard
                      urlArquivo={msg.url_anexo}
                      onVisualizar={handleAbrirVisualizador}
                    />
                  )}

                  <div
                    className={`text-[9px] mt-1.5 text-right ${
                      isOperador ? 'text-zinc-950/70' : 'text-zinc-500'
                    }`}
                  >
                    {formatarDataMsg(msg.data_criacao)}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Notificações e Banners de Alerta */}
      <div className="px-6 space-y-2 shrink-0">
        {erroEnvio && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{erroEnvio}</span>
          </div>
        )}

        {status !== 'fechada' && janelaExcedida && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-500">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Janela de 24 horas para envio de mensagens via WhatsApp excedida. O cliente deve iniciar o contato primeiro para reatar o atendimento livre.
            </span>
          </div>
        )}
      </div>

      {/* Rodapé / Input de Mensagem */}
      <div className="border-t border-zinc-800 bg-zinc-900/20 p-4 shrink-0">
        {status === 'fechada' ? (
          <div className="flex items-center justify-center rounded-lg bg-zinc-900/40 p-4 text-center text-xs text-zinc-400 border border-zinc-800">
            Esta conversa foi encerrada. Se precisar de ajuda, inicie um novo atendimento.
          </div>
        ) : (
          <form onSubmit={handleEnviar} className="flex items-end gap-3">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                ia_active_placeholder(ia_ativa)
              }
              disabled={ia_ativa || enviando}
              rows={1}
              className="flex-1 max-h-32 min-h-[44px] resize-none rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={ia_ativa || enviando || !texto.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 font-medium text-zinc-950 transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-amber-500/10 shrink-0"
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        )}
      </div>
      
      {/* Modal de Criação de Pedido */}
      <CreateOrderModal
        conversa={conversa}
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
      />

      {/* Modal de Visualização de Comprovante */}
      <ModalVisualizadorComprovante
        isOpen={comprovanteModal.isOpen}
        onClose={() => setComprovanteModal({ isOpen: false, urlArquivo: null })}
        urlArquivo={comprovanteModal.urlArquivo}
        nomeArquivo={comprovanteModal.nomeArquivo}
        clienteNome={conversa?.clientes?.nome}
      />
    </div>
  )
}

function ia_active_placeholder(ia_ativa: boolean) {
  return ia_ativa 
    ? "Desative a IA no topo para enviar mensagens..." 
    : "Digite sua resposta..."
}
