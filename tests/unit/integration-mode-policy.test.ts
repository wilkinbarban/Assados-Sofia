import { describe, expect, it, vi } from 'vitest'

describe('integration runtime mode policy', () => {
  it.each(['test', 'development'])('allows mocks in %s', async (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv)
    const { allowsIntegrationMock } = await import('@/lib/runtime/environment')

    expect(allowsIntegrationMock()).toBe(true)
  })

  it.each(['production', 'staging'])('blocks mocks in %s', async (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv)
    const { allowsIntegrationMock } = await import('@/lib/runtime/environment')

    expect(allowsIntegrationMock()).toBe(false)
  })
})
