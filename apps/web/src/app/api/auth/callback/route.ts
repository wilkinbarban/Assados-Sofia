import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { safeInternalRedirect } from '@/lib/auth/safe-redirect'
import { getSupabaseServerUrl } from '@/lib/supabase/url'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeInternalRedirect(searchParams.get('next'), '')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      getSupabaseServerUrl(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
        cookieOptions: {
          name: 'sb-auth-token'
        }
      }
    )
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.url
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const redirectUrl = new URL('/verificar-email?sucesso=true', appUrl)
      if (next) redirectUrl.searchParams.set('next', next)
      return NextResponse.redirect(redirectUrl)
    }
  }

  const fallbackUrl = process.env.NEXT_PUBLIC_APP_URL || request.url
  return NextResponse.redirect(new URL('/verificar-email?sucesso=false', fallbackUrl))
}
