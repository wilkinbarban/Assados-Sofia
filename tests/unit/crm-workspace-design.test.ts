import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('CRM workspace visual hierarchy', () => {
  it('gives the commercial workspace more room than the queue and labels the regions', () => {
    const source = read('apps/web/src/components/operator/OperatorInboxContainer.tsx')
    expect(source).toContain('2xl:w-[22rem]')
    expect(source).toContain('xl:w-[24rem] 2xl:w-[30rem]')
    expect(source).toContain('Atendimento')
    expect(source).toContain('Venda e relacionamento')
  })

  it('presents the customer commerce panel as the primary order workspace', () => {
    const source = read('apps/web/src/components/chat/ChatContainer.tsx')
    expect(source).toContain('Seu pedido')
    expect(source).toContain('lg:w-[min(48vw,640px)]')
    expect(source).toContain('role="tablist"')
    expect(source).toContain('aria-selected={sidebarTab === \'carrinho\'}')
  })
})
