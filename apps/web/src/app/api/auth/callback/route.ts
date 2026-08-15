import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
      return NextResponse.redirect(new URL('/verificar-email?sucesso=true', appUrl))
    }
  }

  const fallbackUrl = process.env.NEXT_PUBLIC_APP_URL || request.url
  return NextResponse.redirect(new URL('/verificar-email?sucesso=false', fallbackUrl))
}
