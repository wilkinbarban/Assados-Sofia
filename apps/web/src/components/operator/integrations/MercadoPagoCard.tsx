'use client'

import React, { useState, useEffect } from 'react'
import {
  Key,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Webhook,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react'
import { IntegrationCardProps } from './types'
import { salvarConfiguracaoAdmin, testarConexaoMercadoPago } from '@/app/actions/admin'

export default function MercadoPagoCard({ initialConfigs, showToast }: IntegrationCardProps) {
  const [accessToken, setAccessToken] = useState(initialConfigs?.MERCADO_PAGO_ACCESS_TOKEN || '')
  const [publicKey, setPublicKey] = useState(initialConfigs?.MERCADO_PAGO_PUBLIC_KEY || '')
  const [webhookSecret, setWebhookSecret] = useState(initialConfigs?.MERCADO_PAGO_WEBHOOK_SECRET || '')

  const [showAccessToken, setShowAccessToken] = useState(false)
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('https://seusite.com.br/api/webhooks/mercadopago')

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhooks/mercadopago`)
    }
  }, [])

  const handleCopyWebhookUrl = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(webhookUrl)
      setCopiedWebhookUrl(true)
      showToast('success', 'URL do Webhook copiada para a área de transferência!')
      setTimeout(() => setCopiedWebhookUrl(false), 3000)
    }
  }

  const handleTestMP = async () => {
    if (!accessToken || accessToken.trim() === '') {
      showToast('error', 'Por favor, insira o Access Token antes de testar.')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testarConexaoMercadoPago(accessToken)
      if (res.success) {
        setTestResult({
          success: true,
          message: 'Conexão aprovada! A API do Mercado Pago respondeu com sucesso.'
        })
        showToast('success', 'Integração com Mercado Pago validada com sucesso!')
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Credenciais inválidas ou sem autorização na API do Mercado Pago.'
        })
        showToast('error', 'Falha na conexão com Mercado Pago.')
      }
    } catch (err: any) {
      console.error(err)
      setTestResult({
        success: false,
        message: 'Erro interno ao testar conexão com Mercado Pago.'
      })
      showToast('error', 'Erro interno de servidor no teste de pagamento.')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const results = await Promise.all([
        salvarConfiguracaoAdmin('MERCADO_PAGO_ACCESS_TOKEN', accessToken),
        salvarConfiguracaoAdmin('MERCADO_PAGO_PUBLIC_KEY', publicKey),
        salvarConfiguracaoAdmin('MERCADO_PAGO_WEBHOOK_SECRET', webhookSecret),
      ])

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        showToast('error', 'Falha ao salvar algumas configurações do Mercado Pago.')
      } else {
        showToast('success', 'Configurações e Tokens do Mercado Pago salvos com sucesso!')
      }
    } catch (err) {
      console.error(err)
      showToast('error', 'Erro ao salvar configurações no servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-amber-500" />
          <div>
            <h3 className="font-bold text-zinc-200">Mercado Pago</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Configuração do gateway de pagamentos para PIX, Cartão de Crédito/Débito e Webhooks de notificação em tempo real.
            </p>
          </div>
        </div>
        <a
          href="https://www.mercadopago.com.br/developers/panel"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-colors"
        >
          <span>Painel Developers</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MERCADO_PAGO_ACCESS_TOKEN */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5 text-amber-500" />
            MERCADO_PAGO_ACCESS_TOKEN (PRODUÇÃO OU TESTE)
          </label>
          <div className="relative">
            <input
              type={showAccessToken ? 'text' : 'password'}
              placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxx ou TEST-xxxxxxxxxxxxxxxxxxxx"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm font-mono text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
            />
            <button
              type="button"
              onClick={() => setShowAccessToken(!showAccessToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Token de API privado obtido em <em>Suas Integrações &gt; Credenciais de Produção / Teste</em>.
          </p>
        </div>

        {/* MERCADO_PAGO_PUBLIC_KEY */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
            MERCADO_PAGO_PUBLIC_KEY
          </label>
          <input
            type="text"
            placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxx ou TEST-xxxxxxxxxxxxxxxxxxxx"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            className="w-full px-4 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm font-mono text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
          />
          <p className="text-[11px] text-zinc-500">
            Chave pública do Mercado Pago utilizada nas interfaces de checkout.
          </p>
        </div>

        {/* MERCADO_PAGO_WEBHOOK_SECRET */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            MERCADO_PAGO_WEBHOOK_SECRET (CHAVE SECRETA DE ASSINATURA HMAC)
          </label>
          <div className="relative">
            <input
              type={showWebhookSecret ? 'text' : 'password'}
              placeholder="Chave secreta de assinatura do Webhook..."
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm font-mono text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
            />
            <button
              type="button"
              onClick={() => setShowWebhookSecret(!showWebhookSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Assinatura secreta (Secret) configurada na seção Webhooks do Mercado Pago para validar a integridade dos eventos (cabeçalho <code>x-signature</code>).
          </p>
        </div>

        {/* URL DE WEBHOOK DE PRODUÇÃO */}
        <div className="md:col-span-2 space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Webhook className="h-3.5 w-3.5 text-amber-500" />
              URL de Produção do Webhook (Cadastrar no Mercado Pago)
            </label>
            <button
              type="button"
              onClick={handleCopyWebhookUrl}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer active:scale-95"
            >
              {copiedWebhookUrl ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Copiar URL</span>
                </>
              )}
            </button>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80 font-mono text-xs text-zinc-300 break-all select-all">
            {webhookUrl}
          </div>

          <div className="text-[11px] text-zinc-400 space-y-1">
            <p className="font-semibold text-zinc-300">
              📌 Instruções para cadastrar no Mercado Pago Developers:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-zinc-400">
              <li>Acesse sua aplicação no Mercado Pago e entre na seção <strong>Webhooks</strong>.</li>
              <li>Cole a URL acima no campo <strong>URL de Notificação / Produção</strong>.</li>
              <li>Selecione os eventos: <strong>Pagamentos (payments)</strong> e <strong>Ordens do Comerciante (merchant_order)</strong>.</li>
            </ul>
          </div>
        </div>

        {/* Botão de Teste */}
        <div className="md:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-zinc-900/20 p-4 rounded-xl border border-zinc-800/40">
          <div className="flex shrink-0">
            <button
              type="button"
              onClick={handleTestMP}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-amber-500 hover:text-amber-400 font-semibold text-xs border border-zinc-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CreditCard className="h-3 w-3" />
              )}
              Testar Conexão Mercado Pago
            </button>
          </div>

          {testResult && (
            <div className={`text-xs font-medium flex items-center gap-1.5 ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* Botão de Salvar */}
      <div className="pt-2 border-t border-zinc-800 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-zinc-950 text-xs shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Salvando Configurações...
            </>
          ) : (
            'Salvar Integração'
          )}
        </button>
      </div>
    </form>
  )
}
