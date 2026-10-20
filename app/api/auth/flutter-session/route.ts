import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { getApiSession, getSiteBaseUrl, revokeApiSession } from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Exchange a short-lived native API sign-in for the normal website cookie. */
export async function GET(request: Request) {
  const apiSession = await getApiSession(request)
  const siteUrl = getSiteBaseUrl(request)
  if (!apiSession) {
    return NextResponse.redirect(new URL('/login?error=invalid', siteUrl), {
      status: 302,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  await createSession(apiSession.user.id)
  await revokeApiSession(request)
  return NextResponse.redirect(new URL('/', siteUrl), {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  })
}
