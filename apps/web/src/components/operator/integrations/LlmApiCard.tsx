'use client'

import React, { useState, useEffect } from 'react'
import {
  Bot,
  Key,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sparkles,
  Crown,
  Server,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Network
} from 'lucide-react'
import { IntegrationCardProps } from './types'
import {
  salvarConfiguracaoAdmin,
  testarConexaoOmniRoute,
  testarConexaoLLM,
  obterModelosDisponiveis
} from '@/app/actions/admin'

export default function LlmApiCard({ initialConfigs, showToast }: IntegrationCardProps) {
  // OmniRoute 3-Tiers State
  const [omniBaseUrl, setOmniBaseUrl] = useState(initialConfigs?.OMNIROUTE_BASE_URL || 'http://omniroute:20128')
  const [omniApiKey, setOmniApiKey] = useState(initialConfigs?.OMNIROUTE_API_KEY || '')
  const [aiRoutingV2, setAiRoutingV2] = useState(initialConfigs?.AI_ROUTING_V2_ENABLED === 'true')
  const [showOmniKey, setShowOmniKey] = useState(false)

  // Legacy Fallback State
  const [legacyFallback, setLegacyFallback] = useState(initialConfigs?.AI_ROUTING_LEGACY_FALLBACK_ENABLED !== 'false')
  const [legacyApiKey, setLegacyApiKey] = useState(initialConfigs?.OPENROUTER_API_KEY || '')
  const [legacyModel, setLegacyModel] = useState(initialConfigs?.OPENROUTER_MODEL || 'deepseek/deepseek-chat')
  const [showLegacyKey, setShowLegacyKey] = useState(false)
  const [showFallbackSection, setShowFallbackSection] = useState(false)

  // Operation States
  const [saving, setSaving] = useState(false)
  const [testingTier, setTestingTier] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    success: boolean
    tier?: string
    modelResolved?: string
    latencyMs?: number
    message: string
  } | null>(null)

  // Legacy models list
  const [legacyModels, setLegacyModels] = useState<{ id: string; name: string }[]>([
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek Chat (v3)' },
    { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' },
    { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta: Llama 3.3 70B' }
  ])

  // Test OmniRoute Tier
  const handleTestOmniTier = async (tierName: string) => {
    if (!omniApiKey || omniApiKey.trim() === '') {
      showToast('error', 'Por favor, informe a API Key do OmniRoute antes de testar.')
      return
    }

    setTestingTier(tierName)
    setTestResult(null)

    try {
      const res = await testarConexaoOmniRoute(omniBaseUrl, omniApiKey, tierName)
      if (res.success) {
        setTestResult({
          success: true,
          tier: tierName,
          modelResolved: res.modelResolved,
          latencyMs: res.latencyMs,
          message: res.response || 'OK'
        })
        showToast('success', `Teste do ${tierName} executado com sucesso!`)
      } else {
        setTestResult({
          success: false,
          tier: tierName,
          message: res.error || 'Falha ao conectar com OmniRoute.'
        })
        showToast('error', `Falha no teste do ${tierName}.`)
      }
    } catch (err: any) {
      console.error(err)
      setTestResult({
        success: false,
        tier: tierName,
        message: 'Erro interno ao testar conexão com o gateway.'
      })
      showToast('error', 'Erro ao testar OmniRoute.')
    } finally {
      setTestingTier(null)
    }
  }

  // Test Legacy Provider
  const handleTestLegacy = async () => {
    if (!legacyApiKey || legacyApiKey.trim() === '') {
      showToast('error', 'Informe a chave de API de contingência.')
      return
    }

    setTestingTier('legacy')
    setTestResult(null)

    try {
      const res = await testarConexaoLLM(legacyApiKey, legacyModel)
      if (res.success) {
        setTestResult({
          success: true,
          tier: 'Fallback Legado',
          modelResolved: legacyModel,
          message: res.response || 'OK'
        })
        showToast('success', 'Conexão com provedor de contingência validada!')
      } else {
        setTestResult({
          success: false,
          tier: 'Fallback Legado',
          message: res.error || 'Erro ao conectar ao provedor de contingência.'
        })
        showToast('error', 'Falha no teste de contingência.')
      }
    } catch (err: any) {
      console.error(err)
      setTestResult({
        success: false,
        tier: 'Fallback Legado',
        message: 'Erro interno de conexão.'
      })
      showToast('error', 'Erro ao testar provedor legado.')
    } finally {
      setTestingTier(null)
    }
  }

  // Save All Configurations
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const results = await Promise.all([
        salvarConfiguracaoAdmin('OMNIROUTE_BASE_URL', omniBaseUrl),
        salvarConfiguracaoAdmin('OMNIROUTE_API_KEY', omniApiKey),
        salvarConfiguracaoAdmin('AI_ROUTING_V2_ENABLED', aiRoutingV2 ? 'true' : 'false'),
        salvarConfiguracaoAdmin('AI_ROUTING_LEGACY_FALLBACK_ENABLED', legacyFallback ? 'true' : 'false'),
        salvarConfiguracaoAdmin('OPENROUTER_API_KEY', legacyApiKey),
        salvarConfiguracaoAdmin('OPENROUTER_MODEL', legacyModel)
      ])

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        showToast('error', 'Falha ao salvar algumas configurações de IA.')
      } else {
        showToast('success', 'Configurações do OmniRoute e 3 Tiers salvas com sucesso!')
      }
    } catch (err) {
      console.error(err)
      showToast('error', 'Erro ao salvar configurações no servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6 shadow-xl">
      {/* Header com Badge de Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-zinc-100 text-base">OmniRoute AI Gateway & 3-Tiers Business Router</h3>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Roteamento dinâmico de inteligência em 3 níveis (Economy, Smart e Frontier) para a agente Sofía.
            </p>
          </div>
        </div>

        <div>
          {aiRoutingV2 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              OmniRoute V2 Ativo (3 Níveis)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Modo Legado (OpenRouter)
            </span>
          )}
        </div>
      </div>

      {/* Switch Master de Ativação do V2 */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-400" />
            <label htmlFor="ai-v2-switch" className="text-sm font-semibold text-zinc-200 cursor-pointer">
              Habilitar Roteador OmniRoute (V2)
            </label>
          </div>
          <p className="text-xs text-zinc-400">
            Classifica automaticamente cada mensagem no combo adequado com zero latência antes do despacho da IA.
          </p>
        </div>
        <button
          type="button"
          id="ai-v2-switch"
          onClick={() => setAiRoutingV2(!aiRoutingV2)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            aiRoutingV2 ? 'bg-amber-500' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-zinc-950 shadow-lg ring-0 transition duration-200 ease-in-out ${
              aiRoutingV2 ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Campos de Conexão com OmniRoute */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* OMNIROUTE_BASE_URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5 text-zinc-500" />
            OMNIROUTE_BASE_URL (Endpoint Gateway)
          </label>
          <input
            type="text"
            placeholder="http://omniroute:20128"
            value={omniBaseUrl}
            onChange={(e) => setOmniBaseUrl(e.target.value)}
            className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30 font-mono text-xs"
          />
        </div>

        {/* OMNIROUTE_API_KEY */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5 text-zinc-500" />
            OMNIROUTE_API_KEY (Chave do CRM)
          </label>
          <div className="relative">
            <input
              type={showOmniKey ? 'text' : 'password'}
              placeholder="sk-af752..."
              value={omniApiKey}
              onChange={(e) => setOmniApiKey(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-zinc-950/60 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:ring-1 focus:ring-amber-500/30 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowOmniKey(!showOmniKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showOmniKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Matriz Visual dos 3 Níveis de Negócio (3 Tiers) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-amber-500" />
            Combos de Negócio Aprovisionados (3 Tiers da Sofía)
          </label>
          <span className="text-[11px] text-zinc-500">Aprovisionados via OmniRoute Gateway</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* TIER 1: ECONOMY */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300">
                  <Zap className="h-3 w-3" />
                  business-economy
                </span>
                <span className="text-[10px] text-emerald-500 font-semibold">Tier 1</span>
              </div>
              <h4 className="text-xs font-bold text-zinc-200 mt-2">FAQs & Cardápio Geral</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Horários, localização, cardápio rápido, saudações e pedidos diretos sem objeção.
              </p>
              <div className="mt-2.5 text-[10px] text-zinc-500 font-mono bg-zinc-950/40 p-2 rounded-lg border border-zinc-800/60">
                <span className="text-emerald-400 font-semibold">Modelos:</span> deepseek-v4-flash → auto/fast → gemini-3.7-flash
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTestOmniTier('business-economy')}
              disabled={testingTier !== null}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {testingTier === 'business-economy' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Testar Economy
            </button>
          </div>

          {/* TIER 2: SMART */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300">
                  <Sparkles className="h-3 w-3" />
                  business-smart
                </span>
                <span className="text-[10px] text-amber-500 font-semibold">Tier 2</span>
              </div>
              <h4 className="text-xs font-bold text-zinc-200 mt-2">Consultivo & Objeções</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Objecções de preço, restrições alimentares (sem porco/glúten), cálculo de carne e upsell.
              </p>
              <div className="mt-2.5 text-[10px] text-zinc-500 font-mono bg-zinc-950/40 p-2 rounded-lg border border-zinc-800/60">
                <span className="text-amber-400 font-semibold">Modelos:</span> gpt-5.4-mini → deepseek-v4-pro → auto/smart
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTestOmniTier('business-smart')}
              disabled={testingTier !== null}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {testingTier === 'business-smart' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Testar Smart
            </button>
          </div>

          {/* TIER 3: FRONTIER */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-950/10 p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-300">
                  <Crown className="h-3 w-3" />
                  business-frontier
                </span>
                <span className="text-[10px] text-purple-400 font-semibold">Tier 3</span>
              </div>
              <h4 className="text-xs font-bold text-zinc-200 mt-2">Grandes Eventos & PJ</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Encomendas &gt; 30 pessoas, eventos corporativos com NF, orçamentos VIP e ticket &gt; R$ 500.
              </p>
              <div className="mt-2.5 text-[10px] text-zinc-500 font-mono bg-zinc-950/40 p-2 rounded-lg border border-zinc-800/60">
                <span className="text-purple-400 font-semibold">Modelos:</span> gpt-5.6-sol → opus-4.6 → claude-opus-thinking
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTestOmniTier('business-frontier')}
              disabled={testingTier !== null}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-semibold border border-purple-500/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {testingTier === 'business-frontier' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Crown className="h-3 w-3" />
              )}
              Testar Frontier
            </button>
          </div>
        </div>
      </div>

      {/* Painel de Resultados de Teste */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex flex-col gap-2 transition-all ${
            testResult.success
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              )}
              <span className="text-xs font-bold">
                {testResult.success ? `Conexão bem-sucedida (${testResult.tier})` : `Falha no teste (${testResult.tier})`}
              </span>
            </div>
            {testResult.latencyMs && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                ⚡ {testResult.latencyMs}ms
              </span>
            )}
          </div>

          {testResult.modelResolved && (
            <div className="text-[11px] text-zinc-400">
              <span className="text-zinc-500">Modelo resolvido:</span>{' '}
              <span className="font-mono text-zinc-200 font-semibold">{testResult.modelResolved}</span>
            </div>
          )}

          <div className="text-xs bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/60 font-sans text-zinc-300">
            {testResult.message}
          </div>
        </div>
      )}

      {/* Seção Sanfona: Fallback de Contingência (OpenRouter / DeepSeek) */}
      <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/30">
        <button
          type="button"
          onClick={() => setShowFallbackSection(!showFallbackSection)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-900/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-amber-500/80" />
            <div>
              <span className="text-xs font-bold text-zinc-300">Contingência & Fallback Legado (OpenRouter / DeepSeek)</span>
              <p className="text-[11px] text-zinc-500">
                Chave de segurança acionada automaticamente caso o OmniRoute fique indisponível.
              </p>
            </div>
          </div>
          {showFallbackSection ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </button>

        {showFallbackSection && (
          <div className="p-4 pt-2 border-t border-zinc-800/60 space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-zinc-800/40">
              <span className="text-xs text-zinc-300 font-medium">Permitir fallback automático para provedor legado</span>
              <input
                type="checkbox"
                checked={legacyFallback}
                onChange={(e) => setLegacyFallback(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/30 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* OPENROUTER_API_KEY */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Key className="h-3 w-3 text-zinc-500" />
                  CHAVE DE CONTINGÊNCIA (OPENROUTER / DEEPSEEK)
                </label>
                <div className="relative">
                  <input
                    type={showLegacyKey ? 'text' : 'password'}
                    placeholder="sk-or-... ou sk-..."
                    value={legacyApiKey}
                    onChange={(e) => setLegacyApiKey(e.target.value)}
                    className="w-full pl-4 pr-10 py-2 bg-zinc-900/60 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLegacyKey(!showLegacyKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showLegacyKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* OPENROUTER_MODEL */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Bot className="h-3 w-3 text-zinc-500" />
                  MODELO DE CONTINGÊNCIA
                </label>
                <select
                  value={legacyModel}
                  onChange={(e) => setLegacyModel(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 focus:border-amber-500/80 rounded-xl text-xs text-zinc-200 outline-none cursor-pointer"
                >
                  {legacyModels.map((m) => (
                    <option key={m.id} value={m.id} className="bg-zinc-950">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleTestLegacy}
                disabled={testingTier !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {testingTier === 'legacy' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3 w-3 text-amber-500" />
                )}
                Testar Provedor de Contingência
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botão de Salvar Todas as Configurações */}
      <div className="pt-3 border-t border-zinc-800 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-zinc-950 text-xs shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Salvando Configurações...
            </>
          ) : (
            'Salvar Configurações de IA'
          )}
        </button>
      </div>
    </form>
  )
}
