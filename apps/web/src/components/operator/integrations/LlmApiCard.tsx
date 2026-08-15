'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Bot, Key, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { IntegrationCardProps } from './types'
import { salvarConfiguracaoAdmin, obterModelosDisponiveis, testarConexaoLLM } from '@/app/actions/admin'

export default function LlmApiCard({ initialConfigs, showToast }: IntegrationCardProps) {
  const [apiKey, setApiKey] = useState(initialConfigs?.OPENROUTER_API_KEY || '')
  const [model, setModel] = useState(initialConfigs?.OPENROUTER_MODEL || 'google/gemini-2.5-flash')
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)

  // States para Modelos e Teste LLM
  const [models, setModels] = useState<{ id: string; name: string }[]>([
    { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' },
    { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek Chat' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70b Instruct' }
  ])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const carregarModelos = useCallback(async (keyToUse = apiKey) => {
    if (!keyToUse || keyToUse.trim() === '' || keyToUse.toLowerCase().includes('placeholder') || keyToUse.toLowerCase().includes('insert_here')) {
      return
    }
    setLoadingModels(true)
    try {
      const res = await obterModelosDisponiveis(keyToUse)
      if (res.success && res.models) {
        setModels(res.models)
      }
    } catch (err) {
      console.error('Erro ao carregar modelos:', err)
    } finally {
      setLoadingModels(false)
    }
  }, [apiKey])

  const handleTestLLM = async () => {
    if (!apiKey || apiKey.trim() === '') {
      showToast('error', 'Por favor, insira a API Key antes de testar.')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testarConexaoLLM(apiKey, model)
      if (res.success) {
        setTestResult({
          success: true,
          message: `Conexão bem-sucedida! Resposta da IA: "${res.response}"`
        })
        showToast('success', 'Teste de LLM bem-sucedido!')
        await carregarModelos(apiKey)
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Erro ao conectar. Verifique as credenciais.'
        })
        showToast('error', 'Falha no teste da API Key.')
      }
    } catch (err: any) {
      console.error(err)
      setTestResult({
        success: false,
        message: 'Erro de conexão no teste.'
      })
      showToast('error', 'Erro interno ao testar LLM.')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const results = await Promise.all([
        salvarConfiguracaoAdmin('OPENROUTER_API_KEY', apiKey),
        salvarConfiguracaoAdmin('OPENROUTER_MODEL', model)
      ])

      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        showToast('error', 'Falha ao salvar as configurações de LLM.')
      } else {
        showToast('success', 'Configurações de LLM salvas com sucesso!')
      }
    } catch (err) {
      console.error(err)
      showToast('error', 'Erro ao salvar as configurações no servidor.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (initialConfigs?.OPENROUTER_API_KEY) {
      carregarModelos(initialConfigs.OPENROUTER_API_KEY)
    }
  }, [initialConfigs?.OPENROUTER_API_KEY, carregarModelos])

  return (
    <form onSubmit={handleSave} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <Bot className="h-6 w-6 text-amber-500" />
        <div>
          <h3 className="font-bold text-zinc-200">OpenRouter / DeepSeek API</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Gerencie a chave de API e selecione o modelo de LLM ativo.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* OPENROUTER_API_KEY */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Key className="h-3 w-3 text-zinc-500" />
            OPENROUTER_API_KEY / DEEPSEEK_API_KEY
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-or-... ou sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => carregarModelos(apiKey)}
              className="w-full pl-4 pr-10 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* OPENROUTER_MODEL */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Bot className="h-3 w-3 text-zinc-500" />
            MODELO ATIVO (LLM)
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 outline-none transition-all cursor-pointer focus:ring-1 focus:ring-amber-500/30"
            disabled={loadingModels}
          >
            {loadingModels ? (
              <option className="bg-zinc-950">Carregando modelos do provedor...</option>
            ) : (
              models.map(m => (
                <option key={m.id} value={m.id} className="bg-zinc-950">
                  {m.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Botões de Teste de Conexão LLM */}
        <div className="md:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-zinc-900/20 p-4 rounded-xl border border-zinc-800/40">
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleTestLLM}
              disabled={testing || loadingModels}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-amber-500 hover:text-amber-400 font-semibold text-xs border border-zinc-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Bot className="h-3 w-3" />
              )}
              Testar Conexão LLM
            </button>
            <button
              type="button"
              onClick={() => carregarModelos(apiKey)}
              disabled={loadingModels || testing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-300 font-semibold text-xs border border-zinc-800 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingModels ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Sincronizar Modelos
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
