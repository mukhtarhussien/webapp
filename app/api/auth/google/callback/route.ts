import { NextResponse } from 'next/server'
import { exchangeGoogleCode, fetchGoogleProfile, readGoogleOAuthState, resolveGoogleLogin, setAdminGoogleLoginIdentity } from '@/lib/google'
import { isRequestFlooded } from '@/lib/security'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = await readGoogleOAuthState()
  const role = state?.requestedRole || 'student'
  if (url.searchParams.get('error')) return NextResponse.redirect(new URL(`/login?error=google_cancelled&role=${role}`, request.url))
  if (!state || state.state !== url.searchParams.get('state')) return NextResponse.redirect(new URL(`/login?error=google_state&role=${role}`, request.url))
  const code = url.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL(`/login?error=google_code&role=${role}`, request.url))
  const tokens = await exchangeGoogleCode(code, state.verifier, url.origin)
  if (!tokens?.access_token) return NextResponse.redirect(new URL(`/login?error=google_token&role=${role}`, request.url))
  const profile = await fetchGoogleProfile(tokens.access_token)
  if (!profile) return NextResponse.redirect(new URL(`/login?error=google_profile&role=${role}`, request.url))
  const profileFlood = await isRequestFlooded([['google', profile.sub], ['email', profile.email]])
  if (profileFlood.blocked) return NextResponse.redirect(new URL(`/login?error=rate_limited&role=${role}`, request.url))

  const result = await resolveGoogleLogin(profile, state.requestedRole)
  if (result.kind === 'signed-in') return NextResponse.redirect(new URL('/', request.url))
  if (result.kind === 'admin-password') {
    await setAdminGoogleLoginIdentity({ userId: result.userId, email: profile.email, googleSubject: profile.sub })
    return NextResponse.redirect(new URL('/login?role=admin&google=verified', request.url))
  }
  if (result.kind === 'inactive') return NextResponse.redirect(new URL(`/login?error=account_inactive&role=${state.requestedRole}`, request.url))
  if (result.kind === 'wrong-role') return NextResponse.redirect(new URL(`/login?error=google_wrong_role&role=${state.requestedRole}`, request.url))
  return NextResponse.redirect(new URL(result.role === 'teacher' ? '/register?role=teacher' : '/register', request.url))
}
