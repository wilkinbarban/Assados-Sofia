import { describe, expect, it, vi } from 'vitest'
import { withSafeRetry } from '@/lib/whatsapp/retry'

describe('WhatsApp Safe Retry: Backoff e Limite Rigoroso de Reintentos', () => {
  it('executes successfully on first attempt without retrying', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 'msg-123' })

    const result = await withSafeRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
    expect(result).toEqual({ id: 'msg-123' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on transient 5xx errors up to maxRetries (2) and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 502 Bad Gateway'))
      .mockResolvedValueOnce({ id: 'msg-success' })

    const result = await withSafeRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
    expect(result).toEqual({ id: 'msg-success' })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('fails after exceeding maxRetries on persistent 5xx errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 500 Internal Server Error'))

    await expect(withSafeRetry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toThrow(
      'HTTP 500 Internal Server Error'
    )
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('does NOT retry on client 4xx errors (400, 401, 403, 404, 422)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 400 Bad Request: Invalid JID'))

    await expect(withSafeRetry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toThrow(
      'HTTP 400 Bad Request: Invalid JID'
    )
    expect(fn).toHaveBeenCalledTimes(1) // Immediate failure, 0 retries
  })
})
