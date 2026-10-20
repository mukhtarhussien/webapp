import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isRequestFlooded } from '@/lib/security'

export async function proxy(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown'

  try {
    const result = await isRequestFlooded([['ip', ip]])
    if (result.blocked) {
      const seconds = result.retryAt ? Math.max(1, Math.ceil((result.retryAt.getTime() - Date.now()) / 1000)) : 900
      return new NextResponse('Too many requests. Try again later.', {
        status: 429,
        headers: {
          'Retry-After': String(seconds),
          'Cache-Control': 'no-store',
        },
      })
    }
  } catch {
    // Do not make an unconfigured database take the whole site offline.
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
