'use client'

import React, { useState } from 'react'
import {
  QrCode,
  Copy,
  Check,
  Send,
  Loader2,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'
import { enviarCobrancaPixAoCliente } from '@/app/actions/pedidos'

export interface DadosPixModal {
  qrCodeBase64?: string
  qrCodeCopiaCola: string
  ticketUrl?: string
  paymentId: string
  valorCentavos: number
  expiraEmMinutos?: number
}

interface ModalCobrancaPixProps {
  isOpen: boolean
  onClose: () => void
  pedidoId: string
  clienteNome?: string
  dadosPix: DadosPixModal | null
  statusPagamento?: string
}

export default function ModalCobrancaPix({
  isOpen,
  onClose,
  pedidoId,
  clienteNome = 'Cliente',
  dadosPix,
  statusPagamento = 'pendente',
}: ModalCobrancaPixProps) {
  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [sucessoEnvio, setSucessoEnvio] = useState<string | null>(null)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)

  if (!isOpen || !dadosPix) return null

  const valorFormatado = (dadosPix.valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(dadosPix.qrCodeCopiaCola)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch (err) {
      console.error('Falha ao copiar:', err)
    }
  }

  const handleEnviarCliente = async () => {
    setEnviando(true)
    setErroEnvio(null)
    setSucessoEnvio(null)

    try {
      const res = await enviarCobrancaPixAoCliente(pedidoId, {
        qrCodeCopiaCola: dadosPix.qrCodeCopiaCola,
        valorCentavos: dadosPix.valorCentavos,
        ticketUrl: dadosPix.ticketUrl,
      })

      if (res.success) {
        setSucessoEnvio('PIX enviado com sucesso para o Chat, WhatsApp e canais do cliente!')
        setTimeout(() => setSucessoEnvio(null), 4000)
      } else {
        setErroEnvio(res.error || 'Não foi possível enviar a cobrança.')
      }
    } catch {
      setErroEnvio('Erro técnico ao disparar cobrança.')
    } finally {
      setEnviando(false)
    }
  }

  const isPago = statusPagamento === 'aprovado'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-3xl border border-amber-500/30 bg-zinc-950 p-6 shadow-2xl shadow-black/80 space-y-5 text-zinc-100 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Glow de fundo */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        {/* Header do Modal */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-inner">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                Cobrança Instantânea • PIX
              </span>
              <h2 className="text-base font-black text-zinc-50">
                Pedido #{pedidoId.slice(0, 8).toUpperCase()}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            title="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status de Pagamento */}
        {isPago ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0" />
            <div>
              <div className="text-sm font-black">Pagamento Aprovado!</div>
              <div className="text-xs text-emerald-400/80">
                Este pedido já foi quitado e confirmado pelo Mercado Pago.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs">
            <span className="text-zinc-400">Cliente: <strong className="text-zinc-200">{clienteNome}</strong></span>
            <span className="font-mono text-base font-black text-amber-400">{valorFormatado}</span>
          </div>
        )}

        {/* QR Code Renderizado */}
        <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white border border-zinc-200 shadow-inner">
          {dadosPix.qrCodeBase64 ? (
            <div className="relative h-48 w-48 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${dadosPix.qrCodeBase64}`}
                alt="QR Code PIX"
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 w-48 text-zinc-500 gap-2">
              <QrCode className="h-16 w-16 text-zinc-800" />
              <span className="text-[11px] text-zinc-600 font-medium">QR Code PIX Ativo</span>
            </div>
          )}
          <span className="text-[11px] font-bold text-zinc-700 mt-2">
            Aponte a câmera ou o app do banco para pagar
          </span>
        </div>

        {/* Chave PIX Copia e Cola */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
            <span>Código PIX Copia e Cola</span>
            <span className="text-[10px] text-zinc-500 font-normal">EMV Padrão Banco Central</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={dadosPix.qrCodeCopiaCola}
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500 select-all truncate"
            />
            <button
              type="button"
              onClick={handleCopiar}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                copiado
                  ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30'
              }`}
            >
              {copiado ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {sucessoEnvio && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium animate-in fade-in">
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{sucessoEnvio}</span>
          </div>
        )}

        {erroEnvio && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{erroEnvio}</span>
          </div>
        )}

        {/* Ações Inferiores */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleEnviarCliente}
            disabled={enviando || isPago}
            className="flex-1 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Enviando para o Cliente...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>📲 Enviar PIX para Chat & WhatsApp do Cliente</span>
              </>
            )}
          </button>

          {dadosPix.ticketUrl && (
            <a
              href={dadosPix.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 text-xs font-semibold transition-all shrink-0"
              title="Visualizar fatura oficial no Mercado Pago"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Fatura MP</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
