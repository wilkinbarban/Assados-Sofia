import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import LlmApiCard from '@/components/operator/integrations/LlmApiCard'
import { salvarConfiguracaoAdmin, testarConexaoOmniRoute, testarConexaoLLM } from '@/app/actions/admin'

vi.mock('@/app/actions/admin', () => ({
  salvarConfiguracaoAdmin: vi.fn().mockResolvedValue({ success: true }),
  testarConexaoOmniRoute: vi.fn().mockResolvedValue({
    success: true,
    response: 'Olá, resposta de teste!',
    modelResolved: 'deepseek-v4-flash',
    latencyMs: 120,
  }),
  testarConexaoLLM: vi.fn().mockResolvedValue({
    success: true,
    response: 'OK',
  }),
  obterModelosDisponiveis: vi.fn().mockResolvedValue({
    success: true,
    models: [{ id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' }],
  }),
}))

describe('LlmApiCard — OmniRoute 3-Tiers Interface', () => {
  const showToast = vi.fn()
  const initialConfigs = {
    OMNIROUTE_BASE_URL: 'http://omniroute:20128',
    OMNIROUTE_API_KEY: 'sk-test-key-12345',
    AI_ROUTING_V2_ENABLED: 'true',
    AI_ROUTING_LEGACY_FALLBACK_ENABLED: 'true',
    OPENROUTER_API_KEY: 'sk-or-backup-key',
    OPENROUTER_MODEL: 'deepseek/deepseek-chat',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renderiza o título, status ativo e os 3 tiers de negócio', () => {
    render(<LlmApiCard initialConfigs={initialConfigs} showToast={showToast} />)

    expect(screen.getByText('OmniRoute AI Gateway & 3-Tiers Business Router')).toBeInTheDocument()
    expect(screen.getByText('OmniRoute V2 Ativo (3 Níveis)')).toBeInTheDocument()

    // 3 Tiers
    expect(screen.getByText('business-economy')).toBeInTheDocument()
    expect(screen.getByText('business-smart')).toBeInTheDocument()
    expect(screen.getByText('business-frontier')).toBeInTheDocument()

    // Botões de teste
    expect(screen.getByRole('button', { name: /Testar Economy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Testar Smart/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Testar Frontier/i })).toBeInTheDocument()
  })

  it('permite testar a conexão de um tier específico do OmniRoute', async () => {
    render(<LlmApiCard initialConfigs={initialConfigs} showToast={showToast} />)

    const btnEconomy = screen.getByRole('button', { name: /Testar Economy/i })
    fireEvent.click(btnEconomy)

    await waitFor(() => {
      expect(testarConexaoOmniRoute).toHaveBeenCalledWith(
        'http://omniroute:20128',
        'sk-test-key-12345',
        'business-economy'
      )
      expect(screen.getByText(/Conexão bem-sucedida \(business-economy\)/i)).toBeInTheDocument()
      expect(screen.getByText('deepseek-v4-flash')).toBeInTheDocument()
      expect(showToast).toHaveBeenCalledWith('success', expect.stringContaining('business-economy'))
    })
  })

  it('salva todas as configurações de IA ao submeter o formulário', async () => {
    render(<LlmApiCard initialConfigs={initialConfigs} showToast={showToast} />)

    const btnSalvar = screen.getByRole('button', { name: /Salvar Configurações de IA/i })
    fireEvent.click(btnSalvar)

    await waitFor(() => {
      expect(salvarConfiguracaoAdmin).toHaveBeenCalledWith('OMNIROUTE_BASE_URL', 'http://omniroute:20128')
      expect(salvarConfiguracaoAdmin).toHaveBeenCalledWith('OMNIROUTE_API_KEY', 'sk-test-key-12345')
      expect(salvarConfiguracaoAdmin).toHaveBeenCalledWith('AI_ROUTING_V2_ENABLED', 'true')
      expect(salvarConfiguracaoAdmin).toHaveBeenCalledWith('AI_ROUTING_LEGACY_FALLBACK_ENABLED', 'true')
      expect(showToast).toHaveBeenCalledWith('success', expect.stringContaining('salvas com sucesso'))
    })
  })
})
