'use client'

import React, { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes in milliseconds

export default function InactivityLogout() {
  const router = useRouter()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const handleLogout = async () => {
      try {
        await supabase.auth.signOut()
        router.push('/login')
      } catch (err) {
        console.error('Erro ao deslogar por inatividade:', err)
        // Fallback redirect
        window.location.href = '/login'
      }
    }

    const resetTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT)
    }

    // Set initial timer
    resetTimer()

    // Activity event listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach((event) => {
      window.addEventListener(event, resetTimer)
    })

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer)
      })
    }
  }, [router, supabase.auth])

  return null
}
