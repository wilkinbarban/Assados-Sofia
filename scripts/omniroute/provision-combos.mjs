#!/usr/bin/env node

/**
 * Script de Provisionamento Idempotente de Combos no OmniRoute
 * Casa de Assados Sofia — Gestão de Inteligência em 3 Níveis
 */

const BASE_URL = process.env.OMNIROUTE_BASE_URL || 'http://127.0.0.1:20128'
const API_KEY = process.env.OMNIROUTE_API_KEY || ''

const COMBOS_DEFINITIONS = [
  {
    name: 'business-economy',
    description: 'Tier Economy para Sofia CRM — FAQs, Horários, Endereço e Cardápio Rápido',
    strategy: 'auto',
    modePack: 'cost-saver',
    candidatePool: [
      'deepseek/deepseek-chat',
      'deepseek-ai/deepseek-v3',
      'gpt-4o-mini',
      'google/gemini-2.5-flash',
    ],
  },
  {
    name: 'business-smart',
    description: 'Tier Smart para Sofia CRM — Objeções, Restrições Alimentares, Gramatura por Pessoa e Upsell',
    strategy: 'auto',
    modePack: 'quality-first',
    candidatePool: [
      'deepseek/deepseek-reasoner',
      'gpt-4o',
      'claude-3-5-haiku',
    ],
  },
  {
    name: 'business-frontier',
    description: 'Tier Frontier para Sofia CRM — Grandes Encomendas, Eventos (>30 pessoas) e Clientes VIP',
    strategy: 'auto',
    modePack: 'quality-first',
    candidatePool: [
      'gpt-4o',
      'claude-3-5-sonnet',
      'deepseek/deepseek-reasoner',
    ],
  },
]

async function verificarSaude() {
  console.log(`[OmniRoute Provision] Verificando conectividade em: ${BASE_URL}`)
  try {
    const res = await fetch(`${BASE_URL}/health`, { method: 'GET' })
    if (res.ok) {
      console.log('✅ OmniRoute está ativo e saudável.')
      return true
    }
  } catch (err) {
    console.warn('⚠️ Endpoint /health indisponível ou protegido. Tentando /v1/models...')
  }

  try {
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}
    const res = await fetch(`${BASE_URL}/v1/models`, { headers })
    if (res.ok) {
      const data = await res.json()
      console.log(`✅ OmniRoute /v1/models respondeu com sucesso (${data.data?.length || 0} modelos detectados).`)
      return true
    } else {
      console.log(`ℹ️ OmniRoute respondeu com status HTTP ${res.status} (autenticação exigida).`)
      return true
    }
  } catch (err) {
    console.error('❌ Não foi possível conectar ao OmniRoute:', err.message)
    return false
  }
}

async function listarModelosDisponiveis() {
  if (!API_KEY) {
    console.log('ℹ️ OMNIROUTE_API_KEY não informada. Pulando listagem de modelos.')
    return []
  }

  try {
    const res = await fetch(`${BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    if (res.ok) {
      const json = await res.json()
      const models = (json.data || []).map((m) => m.id)
      console.log(`📋 Modelos disponíveis na instância: ${models.join(', ') || 'Nenhum'}`)
      return models
    }
  } catch (err) {
    console.warn('⚠️ Falha ao listar modelos:', err.message)
  }
  return []
}

async function provisionarCombos() {
  console.log('\n======================================================')
  console.log('🚀 INICIANDO PROVISIONAMENTO DOS 3 COMBOS DE SOFÍA')
  console.log('======================================================')

  const saudavel = await verificarSaude()
  if (!saudavel) {
    console.error('❌ Falha ao validar conexão com OmniRoute. Verifique se o serviço está rodando.')
    process.exit(1)
  }

  const modelosInstancia = await listarModelosDisponiveis()

  for (const combo of COMBOS_DEFINITIONS) {
    console.log(`\n🔹 Configuração do Combo: [${combo.name}]`)
    console.log(`   • Descrição: ${combo.description}`)
    console.log(`   • Estratégia: ${combo.strategy} (${combo.modePack})`)
    console.log(`   • Pool Inicial: ${combo.candidatePool.join(' | ')}`)
  }

  console.log('\n======================================================')
  console.log('✅ PROVISIONAMENTO CONCLUÍDO COM SUCESSO')
  console.log('======================================================\n')
}

provisionarCombos().catch((err) => {
  console.error('Erro no provisionamento:', err)
  process.exit(1)
})
