/**
 * Next.js middleware (Edge Runtime)。
 *
 * Edge Runtime では localStorage を参照できないため、オンボーディング完了チェックは
 * クライアントサイドの useEffect + router.replace で実装している（useOnboarding / OnboardingPage 参照）。
 * ここでは将来の拡張のため matcher を定義するのみ。
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/scan', '/history', '/settings', '/onboarding'],
}
