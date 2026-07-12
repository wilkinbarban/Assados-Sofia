import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import InactivityLogout from '@/components/operator/InactivityLogout'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock supabase client
const mockSignOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}))

describe('InactivityLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('triggers signOut and redirect after 15 minutes of inactivity', async () => {
    render(<InactivityLogout />)

    // Advance time by 14 minutes and 59 seconds (nothing should happen)
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1000)
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()

    // Advance time by 1 more second to reach 15 minutes
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('resets the inactivity timer on user interaction', async () => {
    render(<InactivityLogout />)

    // Advance time by 10 minutes
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(mockSignOut).not.toHaveBeenCalled()

    // Simulate user interaction: mousemove
    window.dispatchEvent(new Event('mousemove'))

    // Advance time by another 10 minutes (total 20 mins from start, but 10 mins from interaction)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(mockSignOut).not.toHaveBeenCalled() // Timer reset, so not fired yet

    // Advance by 5 more minutes (reaches 15 minutes since mousemove)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})
