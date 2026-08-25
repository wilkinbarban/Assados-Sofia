import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OperatorInboxContainer from '@/components/operator/OperatorInboxContainer'

vi.mock('@/app/actions/atendimento', () => ({
  alternarSofiaGlobal: vi.fn(),
  alternarSofiaWhatsApp: vi.fn(),
  obterStatusSofiaAtendimento: vi.fn().mockResolvedValue({ success: false, error: 'unavailable' }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => ({ on() { return this }, subscribe: () => ({}) }),
    removeChannel: vi.fn(),
  }),
}))

vi.mock('@/components/operator/ConversationsQueue', () => ({
  default: () => <div data-testid="queue" />,
}))

vi.mock('@/components/operator/OperatorChatConsole', () => ({
  default: () => <div data-testid="chat" />,
}))

vi.mock('@/components/operator/ClientCrmPanel', () => ({
  default: () => <div data-testid="commercial-panel" />,
}))

vi.mock('@/components/operator/SofiaGlobalStatusBar', () => ({
  default: () => null,
}))

describe('OperatorInboxContainer responsive workspace', () => {
  it('uses a stacked mobile workspace and restores three columns on wide screens', () => {
    render(<OperatorInboxContainer conversasIniciais={[]} initialSofiaStatus={null} />)

    expect(screen.getByTestId('operator-workspace')).toHaveClass('flex-col', 'xl:flex-row')
    expect(screen.getByTestId('queue-region')).toHaveClass('h-64', 'xl:h-full')
    expect(screen.getByTestId('chat-region')).toHaveClass('min-h-[24rem]', 'xl:min-h-0')
    expect(screen.getByTestId('commercial-region')).toHaveClass('h-[32rem]', 'xl:h-full')
  })
})
