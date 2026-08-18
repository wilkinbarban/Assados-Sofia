import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as liveness } from '@/app/api/health/live/route'
import { GET as readiness } from '@/app/api/health/ready/route'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('production health routes', () => {
  it('reports process liveness without checking dependencies', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await liveness()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports readiness only when both private dependencies respond', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const response = await readiness()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ready' })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/health'),
      expect.objectContaining({ headers: expect.objectContaining({ apikey: expect.any(String) }) }),
    )
  })

  it('fails readiness without exposing the failed dependency', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValueOnce(new Error('connection refused')))

    const response = await readiness()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ status: 'unavailable' })
  })
})
