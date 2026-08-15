'use client'

import React, { useState } from 'react'
import { Key, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import { IntegrationCardProps } from './types'
import { salvarConfiguracaoAdmin, testarConexaoTelegram } from '@/app/actions/admin'

export default function TelegramBotCard({ initialConfigs, showToast }: IntegrationCardProps) {
  const [token, setToken] = useState(initialConfigs?.TELEGRAM_BOT_TOKEN || '')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTest = async () => {
    if (!token || token.trim() === '') {
      showToast('error', 'Por favor, insira o token do Telegram antes de testar.')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testarConexaoTelegram(token)
      if (res.success) {
        setTestResult({
          success: true,
          message: `Conexão OK! Nome do Bot: @${res.username} (${res.name})`
        })
        showToast('success', 'Conexão com o Telegram Bot verificada com sucesso!')
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Token inválido ou falha na API do Telegram.'
        })
        showToast('error', 'Falha ao conectar com a API do Telegram.')
      }
    } catch (err: any) {
      console.error(err)
      setTestResult({
        success: false,
        message: 'Erro interno de conexão no teste.'
      })
      showToast('error', 'Erro ao testar API do Telegram.')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await salvarConfiguracaoAdmin('TELEGRAM_BOT_TOKEN', token)
      if (res.success) {
        showToast('success', 'Token do Telegram Bot salvo com sucesso!')
      } else {
        showToast('error', 'Falha ao salvar o token do Telegram Bot.')
      }
    } catch (err) {
      console.error(err)
      showToast('error', 'Erro ao salvar as configurações no servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6 transition-all hover:border-zinc-700/50">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Send className="h-6 w-6 text-amber-500" />
          <div>
            <h3 className="font-bold text-zinc-200">Telegram Bot</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Gerencie as credenciais do bot do Telegram para notificações e atendimento automático.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Key className="h-3 w-3 text-zinc-500" />
            TELEGRAM_BOT_TOKEN
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              placeholder="Ex: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full pl-4 pr-10 py-2 bg-zinc-900/40 border border-zinc-850 focus:border-amber-500/80 rounded-xl text-xs text-zinc-200 placeholder-zinc-700 outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Test connection for Telegram */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-zinc-950/20 p-3 rounded-xl border border-zinc-850">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-amber-500 hover:text-amber-400 font-semibold text-xs border border-zinc-800 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Testar Conexão Telegram
          </button>

          {testResult && (
            <div className={`text-xs font-medium flex items-center gap-1.5 ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
              {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* Save configurations button */}
      <div className="pt-4 border-t border-zinc-800 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-zinc-950 text-xs shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Token do Telegram'
          )}
        </button>
      </div>
    </form>
  )
}
