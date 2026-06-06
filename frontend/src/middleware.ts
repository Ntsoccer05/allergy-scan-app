/**
 * Next.js middleware (Edge Runtime)。
 *
 * Supabase Auth ガード：
 * - 未ログイン + 保護ルート → /login へリダイレクト
 * - 未ログイン + /admin → /403 へリダイレクト
 * - ログイン済み + /login, /signup → /scan へリダイレクト
 * - ログイン済み + /admin で role !== 'admin' → /403 へリダイレクト
 *
 * Edge Runtime では localStorage を参照できないため、オンボーディング完了チェックは
 * クライアントサイドの useEffect + router.replace で実装している（useOnboarding / OnboardingPage 参照）。
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/login', '/signup', '/reset-password', '/public']
const AUTH_PATHS = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Supabase 未設定の開発環境ではガードをスキップ
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  const isAuthPath = AUTH_PATHS.some(p => pathname === p)
  const isAdminPath = pathname.startsWith('/admin')

  // 未ログイン + /admin → 403
  if (!user && isAdminPath) {
    return NextResponse.redirect(new URL('/403', request.url))
  }

  // 未ログイン + 保護ルート → ログインページへ
  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ログイン済み + /admin で admin でない → 403
  if (user && isAdminPath) {
    const role = (user.app_metadata as { role?: string })?.role
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/403', request.url))
    }
  }

  // ログイン済みで /login・/signup → /scan へ
  if (user && isAuthPath) {
    return NextResponse.redirect(new URL('/scan', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'],
}
