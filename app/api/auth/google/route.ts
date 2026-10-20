import { NextResponse } from 'next/server'
import { beginGoogleOAuth, googleConfigured } from '@/lib/google'

export const runtime = 'nodejs'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 10

const requests = new Map<
  string,
  {
    count: number
    resetAt: number
  }
>()

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')

  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }

  return request.headers.get('x-real-ip') || 'unknown'
}

function isRequestFlooded(ip: string) {
  const now = Date.now()
  const current = requests.get(ip)

  if (!current || now >= current.resetAt) {
    requests.set(ip, {
      count: 1,
      resetAt: now + WINDOW_MS,
    })

    return {
      blocked: false,
    }
  }

  current.count += 1

  return {
    blocked: current.count > MAX_REQUESTS,
  }
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const requestedRole = (['student', 'teacher', 'admin'] as const).find(role => role === new URL(request.url).searchParams.get('role')) || 'student'

  if (
    !googleConfigured() ||
    (process.env.NODE_ENV === 'production' &&
      !process.env.GOOGLE_REDIRECT_URI)
  ) {
    return NextResponse.redirect(
      new URL(`/login?error=google_not_configured&role=${requestedRole}`, request.url)
    )
  }

  const ip = getClientIp(request)
  const flood = isRequestFlooded(ip)

  if (flood.blocked) {
    return NextResponse.redirect(
      new URL(`/login?error=rate_limited&role=${requestedRole}`, request.url)
    )
  }

  try {
    const url = await beginGoogleOAuth(origin, requestedRole)

    return NextResponse.redirect(url)
  } catch {
    return NextResponse.redirect(
      new URL(`/login?error=google_not_configured&role=${requestedRole}`, request.url)
    )
  }
}
