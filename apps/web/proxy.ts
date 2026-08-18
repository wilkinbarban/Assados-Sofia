import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './src/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  request.headers.set('x-pathname', pathname)

  // Health and API routes must not depend on an authentication refresh.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next({ request })
  }

  // Refresh sessions only for page requests.
  const { supabase, user, response } = await updateSession(request)

  // 1. If user is logged in, check active status first
  if (user) {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('funcao, ativo')
      .eq('id', user.id)
      .single()

    if (perfil && perfil.ativo === false) {
      await supabase.auth.signOut()
      const redirectUrl = new URL('/login?erro=inativo', request.url)
      const errorResponse = NextResponse.redirect(redirectUrl)
      
      // Clear cookies to ensure session is cleared
      const cookiesToClear = request.cookies.getAll()
      for (const cookie of cookiesToClear) {
        if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
          errorResponse.cookies.set(cookie.name, '', { maxAge: -1 })
        }
      }
      return errorResponse
    }

    // 2. Validate role-based routes
    const isAdminRoute = pathname.startsWith('/admin')
    const isAtendimentoAdminRoute = pathname === '/atendimento/admin' || pathname.startsWith('/atendimento/admin/')
    const isAtendimentoRoute = pathname === '/atendimento' || pathname.startsWith('/atendimento/')
    const isDashboardRoute = pathname.startsWith('/dashboard')
    const isClienteRoute = pathname.startsWith('/cliente')

    if (isAdminRoute) {
      if (!perfil || perfil.funcao !== 'admin') {
        return NextResponse.redirect(new URL('/403', request.url))
      }
    }

    if (isAtendimentoAdminRoute) {
      const allowedRoles = ['admin', 'supervisor']
      if (!perfil || !allowedRoles.includes(perfil.funcao)) {
        return NextResponse.redirect(new URL('/403', request.url))
      }
    }

    if (isAtendimentoRoute || isDashboardRoute) {
      const allowedRoles = ['admin', 'supervisor', 'vendedor']
      if (!perfil || !allowedRoles.includes(perfil.funcao)) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }

    if (isClienteRoute) {
      if (pathname !== '/cliente/verificar-telefone') {
        // Check if client record with usuario_id exists (meaning verified phone)
        const { data: cliente } = await supabase
          .from('clientes')
          .select('id')
          .eq('usuario_id', user.id)
          .single()

        if (!cliente) {
          return NextResponse.redirect(new URL('/cliente/verificar-telefone', request.url))
        }
      }
    }
  } else {
    // If not logged in, redirect to login for protected routes
    const isProtected =
      pathname.startsWith('/admin') ||
      pathname.startsWith('/atendimento') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/cliente')

    if (isProtected) {
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
