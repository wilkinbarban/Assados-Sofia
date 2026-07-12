'use client'

import React, { useState } from 'react'
import { Key, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, CreditCard } from 'lucide-react'
import { IntegrationCardProps } from './types'
import { salvarConfiguracaoAdmin, testarConexaoMercadoPago } from '@/app/actions/admin'

export default function MercadoPagoCard({ initialConfigs, showToast }: IntegrationCardProps) {
  const [accessToken, setAccessToken] = useState(initialConfigs?.MERCADO_PAGO_ACCESS_TOKEN || '')
  const [publicKey, setPublicKey] = useState(initialConfigs?.MERCADO_PAGO_PUBLIC_KEY || '')

  const [showAccessToken, setShowAccessToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

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
        showToast('success', 'Integração com Mercado Pago validada!')
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
        salvarConfiguracaoAdmin('MERCADO_PAGO_PUBLIC_KEY', publicKey)
      ])

      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        showToast('error', 'Falha ao salvar configurações do Mercado Pago.')
      } else {
        showToast('success', 'Configurações do Mercado Pago salvas com sucesso!')
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
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <CreditCard className="h-6 w-6 text-amber-500" />
        <div>
          <h3 className="font-bold text-zinc-200">Mercado Pago</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Configuração do gateway de pagamentos para pix e cartões de crédito/débito online.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MERCADO_PAGO_ACCESS_TOKEN */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Key className="h-3 w-3 text-zinc-500" />
            MERCADO_PAGO_ACCESS_TOKEN (PRODUÇÃO / TESTE)
          </label>
          <div className="relative">
            <input
              type={showAccessToken ? 'text' : 'password'}
              placeholder="APP_USR-..."
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
            />
            <button
              type="button"
              onClick={() => setShowAccessToken(!showAccessToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* MERCADO_PAGO_PUBLIC_KEY */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <CreditCard className="h-3 w-3 text-zinc-500" />
            MERCADO_PAGO_PUBLIC_KEY
          </label>
          <input
            type="text"
            placeholder="APP_USR-..."
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            className="w-full px-4 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
          />
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
