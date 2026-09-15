import { describe, expect, it, vi } from 'vitest'
import { createEvolutionPresence } from '@/lib/whatsapp/evolution-presence'

describe('Evolution composing presence', () => {
  it('uses one owned timeout and waits the remaining provider delay after an instant success', async () => {
    vi.useFakeTimers()
    try {
      let now = 0
      const send = vi.fn().mockResolvedValue(true)
      const handle = createEvolutionPresence({ send, setTimeout, clearTimeout: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>), now: () => now })
      await vi.advanceTimersByTimeAsync(0)
      expect(send).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)
      now = 3999
      await vi.advanceTimersByTimeAsync(3999)
      expect(send).toHaveBeenCalledTimes(1)
      now = 4000
      await vi.advanceTimersByTimeAsync(1)
      expect(send).toHaveBeenCalledTimes(2)
      handle.stop()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('backs off sync and rejected failures and stop cancels the owned retry', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn().mockRejectedValueOnce(Error('secret')).mockResolvedValue(true)
      const handle = createEvolutionPresence({ send, setTimeout, clearTimeout: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>) })
      await vi.advanceTimersByTimeAsync(0)
      expect(send).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)
      handle.stop()
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(4000)
      expect(send).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('keeps provider failures best effort and exposes sanitized observations', async () => {
    const observe = vi.fn()
    const handle = createEvolutionPresence({
      send: vi.fn().mockRejectedValue(new Error('secret URL token')),
      setTimeout, clearTimeout: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>), observe,
    })
    await vi.waitFor(() => expect(observe).toHaveBeenLastCalledWith({ tag: 'evolution_presence', event: 'unavailable', reason: 'provider_unavailable' }))
    handle.stop()
  })
})
