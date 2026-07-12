'use client'

import React, { useState } from 'react'
import { Calendar, Server, Mail, Key, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { CalendarCardProps } from './types'
import { testarGoogleCalendar, salvarConfiguracaoAdmin } from '@/app/actions/admin'

export default function GoogleCalendarCard({ calendarConfig, showToast, initialConfigs }: CalendarCardProps) {
  const [calendarId, setCalendarId] = useState(initialConfigs?.GOOGLE_CALENDAR_ID || calendarConfig.googleCalendarId || '')
  const [clientEmail, setClientEmail] = useState(initialConfigs?.GOOGLE_CLIENT_EMAIL || calendarConfig.googleClientEmail || '')
  const [privateKey, setPrivateKey] = useState(initialConfigs?.GOOGLE_PRIVATE_KEY || '')
  
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    eventId?: string | null
    mock?: boolean
  } | null>(null)

  const handleTestCalendar = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testarGoogleCalendar(calendarId, clientEmail, privateKey)
      if (res.success) {
        setTestResult({
          success: true,
          message: 'Conexão com o Google Calendar realizada com sucesso!',
          eventId: res.data?.eventId,
          mock: res.data?.mock
        })
        showToast('success', 'Integração com Google Calendar OK!')
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Falha ao validar credenciais.'
        })
        showToast('error', 'Falha na validação do calendário.')
      }
    } catch (err: any) {
      console.error(err)
      setTestResult({
        success: false,
        message: 'Erro interno ao disparar teste de integração.'
      })
      showToast('error', 'Erro interno de servidor no teste de integração.')
    } finally {
      setTesting(false)
    }
  }

  const handleSaveCalendar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const results = await Promise.all([
        salvarConfiguracaoAdmin('GOOGLE_CALENDAR_ID', calendarId),
        salvarConfiguracaoAdmin('GOOGLE_CLIENT_EMAIL', clientEmail),
        salvarConfiguracaoAdmin('GOOGLE_PRIVATE_KEY', privateKey)
      ])

      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        showToast('error', 'Falha ao salvar algumas credenciais do Google Calendar.')
      } else {
        showToast('success', 'Configurações do Google Calendar salvas com sucesso!')
      }
    } catch (err) {
      console.error(err)
      showToast('error', 'Erro ao salvar as configurações no servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <Calendar className="h-6 w-6 text-amber-500" />
        <div>
          <h3 className="font-bold text-zinc-200">Google Calendar API</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Responsável pelo agendamento de eventos e horários dos clientes.</p>
        </div>
      </div>

      <form onSubmit={handleSaveCalendar} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* GOOGLE_CALENDAR_ID */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Server className="h-3 w-3 text-zinc-500" />
              GOOGLE_CALENDAR_ID
            </label>
            <input
              type="text"
              placeholder="seu_calendar_id@group.calendar.google.com"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all"
            />
          </div>

          {/* GOOGLE_CLIENT_EMAIL */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-zinc-500" />
              GOOGLE_CLIENT_EMAIL
            </label>
            <input
              type="email"
              placeholder="seu-service-account@projeto.iam.gserviceaccount.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all"
            />
          </div>

          {/* GOOGLE_PRIVATE_KEY */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Key className="h-3 w-3 text-zinc-500" />
                GOOGLE_PRIVATE_KEY
              </label>
              <div className="flex items-center gap-2">
                {calendarConfig.googlePrivateKeyConfigured || privateKey ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                    Configurada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 border border-rose-500/20">
                    <span className="h-1 w-1 rounded-full bg-rose-500" />
                    Ausente
                  </span>
                )}
              </div>
            </div>
            <div className="relative">
              <textarea
                rows={3}
                placeholder="-----BEGIN PRIVATE KEY-----\n..."
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all font-mono text-xs"
                style={{ WebkitTextSecurity: showPrivateKey ? 'none' : 'disc' } as any}
              />
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="absolute right-3 top-4 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="pt-4 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTestCalendar}
              disabled={testing || saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-500 hover:text-amber-400 font-semibold text-xs border border-zinc-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Calendar className="h-3 w-3" />
              )}
              Testar Conexão Calendar
            </button>
          </div>

          <button
            type="submit"
            disabled={saving || testing}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-zinc-950 text-xs shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Salvando Configurações...
              </>
            ) : (
              'Salvar Google Calendar'
            )}
          </button>
        </div>
      </form>

      {/* Resultado do Teste */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border animate-fade-in ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          <div className="flex items-start gap-3">
            {testResult.success ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="font-bold text-sm">
                {testResult.success ? 'Conexão Aprovada!' : 'Falha na Conexão'}
              </p>
              <p className="text-xs text-zinc-300">
                {testResult.message}
              </p>
              {testResult.success && testResult.eventId && (
                <div className="text-[10px] text-zinc-400 font-mono mt-1 space-y-0.5">
                  <p>ID do Evento: <span className="text-emerald-300 font-bold select-all">{testResult.eventId}</span></p>
                  <p>Modo Operação: {testResult.mock ? <span className="text-amber-400 font-bold">Simulado (Ambiente Mock)</span> : <span className="text-emerald-400 font-bold">Produção (API Real)</span>}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
