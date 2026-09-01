import { describe, expect, it, vi } from 'vitest'
import { resolveOmniRouteAdminTarget } from '@/lib/ai/omniroute-admin-target'

describe('OmniRoute admin destination boundary', () => {
  it('never combines a caller host with the environment secret', async () => {
    await expect(resolveOmniRouteAdminTarget({ callerBaseUrl:'https://attacker.example',callerApiKey:'',configuredBaseUrl:'https://gateway.example',configuredApiKey:'env-secret',lookup:vi.fn() }))
      .rejects.toThrow('OMNIROUTE_EXPLICIT_KEY_REQUIRED')
  })
  it.each(['http://127.0.0.1:20128','https://169.254.169.254','file:///etc/passwd','https://user:pass@example.com','https://example.com/#x'])(
    'rejects unsafe caller destination %s', async url => {
      await expect(resolveOmniRouteAdminTarget({callerBaseUrl:url,callerApiKey:'explicit',lookup:vi.fn().mockResolvedValue([{address:'93.184.216.34',family:4}])})).rejects.toThrow()
    })
  it('rejects an unapproved public HTTPS caller host even with an explicit key', async () => {
    await expect(resolveOmniRouteAdminTarget({callerBaseUrl:'https://attacker.example/',callerApiKey:'explicit',configuredBaseUrl:'https://gateway.example',configuredApiKey:'env-secret',lookup:vi.fn()})).rejects.toThrow('OMNIROUTE_UNAPPROVED_DESTINATION')
  })
  it('accepts the exact configured internal host and explicit configured key from the UI', async () => {
    await expect(resolveOmniRouteAdminTarget({callerBaseUrl:'http://omniroute:20128',callerApiKey:'env-secret',configuredBaseUrl:'http://omniroute:20128',configuredApiKey:'env-secret',lookup:vi.fn()})).resolves.toEqual({baseUrl:'http://omniroute:20128',apiKey:'env-secret'})
  })
  it('preserves configured internal gateway fallback as one trusted pair', async () => {
    await expect(resolveOmniRouteAdminTarget({callerBaseUrl:'',callerApiKey:'',configuredBaseUrl:'http://omniroute:20128',configuredApiKey:'env-secret',lookup:vi.fn()})).resolves.toEqual({baseUrl:'http://omniroute:20128',apiKey:'env-secret'})
  })
})
