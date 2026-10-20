import { and, eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { apiError, apiJson, createApiSession, getSiteBaseUrl, readJson, safeUser } from '@/lib/api/v1'
import { getClientIp, isRequestFlooded } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type GoogleTokenInfo = {
  aud?: string
  iss?: string
  exp?: string
  sub?: string
  email?: string
  email_verified?: string
}

export async function POST(request: Request) {
  const flood = await isRequestFlooded([['google-mobile-ip', await getClientIp()]])
  if (flood.blocked) return apiError('rate_limited', 'محاولات كثيرة. حاول بعد قليل.', 429)

  const body = await readJson(request)
  const idToken = typeof body?.idToken === 'string' ? body.idToken : ''
  const expectedRole = body?.role === 'student' || body?.role === 'teacher' || body?.role === 'admin' ? body.role : null
  if (!idToken || idToken.length > 8192) return apiError('invalid_request', 'رمز Google غير موجود أو غير صالح.', 400)

  const audiences = [
    process.env.GOOGLE_CLIENT_ID,
    ...(process.env.GOOGLE_MOBILE_CLIENT_IDS || '').split(','),
  ].map(value => value?.trim()).filter((value): value is string => Boolean(value))
  if (!audiences.length) return apiError('google_not_configured', 'تسجيل Google للتطبيق غير مهيأ على الخادم.', 503)

  let tokenInfo: GoogleTokenInfo
  try {
    const endpoint = new URL('https://oauth2.googleapis.com/tokeninfo')
    endpoint.searchParams.set('id_token', idToken)
    const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!response.ok) return apiError('invalid_google_token', 'تعذر التحقق من حساب Google.', 401)
    tokenInfo = await response.json() as GoogleTokenInfo
  } catch {
    return apiError('google_unavailable', 'تعذر الاتصال بخدمة Google. حاول مرة ثانية.', 503)
  }

  const expiry = Number(tokenInfo.exp)
  if (
    !tokenInfo.sub ||
    !tokenInfo.email ||
    tokenInfo.email_verified !== 'true' ||
    !audiences.includes(tokenInfo.aud || '') ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(tokenInfo.iss || '') ||
    !Number.isFinite(expiry) ||
    expiry <= Math.floor(Date.now() / 1000)
  ) return apiError('invalid_google_token', 'تعذر التحقق من حساب Google.', 401)

  const email = tokenInfo.email.trim().toLowerCase()
  const db = requireDb()
  let [user] = await db.select().from(users).where(and(eq(users.googleSubject, tokenInfo.sub), eq(users.isActive, true))).limit(1)

  if (!user) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!byEmail) {
      return apiError('registration_required', 'هذا الحساب غير مسجل في المدرسة بعد.', 403, {
        registrationUrl: getSiteBaseUrl(request) + '/register',
      })
    }
    if (!byEmail.isActive) return apiError('account_inactive', 'الحساب غير مفعّل. تواصل مع إدارة المدرسة.', 403)
    if (byEmail.googleSubject && byEmail.googleSubject !== tokenInfo.sub) {
      return apiError('google_account_mismatch', 'حساب Google لا يطابق الحساب المرتبط في المدرسة.', 403)
    }
    if (byEmail.role === 'admin') {
      if (expectedRole !== 'admin') return apiError('google_wrong_role', 'اختر دخول الإدارة لهذا الحساب.', 403)
    } else if (expectedRole === 'admin') {
      return apiError('google_wrong_role', 'هذا البريد ليس مرتبطًا بحساب إدارة.', 403)
    }
    await db.update(users).set({ googleSubject: tokenInfo.sub, updatedAt: new Date() }).where(eq(users.id, byEmail.id))
    user = { ...byEmail, googleSubject: tokenInfo.sub }
  }

  if (user.role === 'admin') {
    if (expectedRole !== 'admin') return apiError('google_wrong_role', 'اختر دخول الإدارة لهذا الحساب.', 403)
    return apiJson({ requiresPassword: true, googleVerified: true, email: user.email, role: 'admin' })
  }
  if (expectedRole && user.role !== expectedRole) return apiError('google_wrong_role', 'هذا حساب Google مرتبط بنوع حساب آخر. اختر زر الدخول المناسب له.', 403)
  const session = await createApiSession(user.id)
  return apiJson({ accessToken: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: safeUser(user, getSiteBaseUrl(request)) })
}
