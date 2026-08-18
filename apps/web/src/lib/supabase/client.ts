import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublicUrl } from './url'

export function createClient() {
  const url = getSupabasePublicUrl()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key'
  return createBrowserClient(
    url,
    key,
    {
      cookieOptions: {
        name: 'sb-auth-token'
      }
    }
  )
}
