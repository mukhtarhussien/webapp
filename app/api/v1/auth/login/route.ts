import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { createApiChallenge, createApiSession, apiError, apiJson, readJson, safeUser, getSiteBaseUrl } from '@/lib/api/v1'
import { verifyPassword, hashPassword } from '@/lib/auth'
import { checkPasswordLock, clearPasswordFailures, getClientIp, isRequestFlooded, normalizePhone, recordPasswordFailure } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DUMMY_PASSWORD_HASH = hashPassword('school-pulse-dummy-password')

export async function POST(request: Request) {
  const body = await readJson(request)
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const expectedRole = body?.role === 'student' || body?.role === 'teacher' || body?.role === 'admin' ? body.role : null
  if (!identifier || !password || identifier.length > 320 || password.length > 1024) {
    return apiError('invalid_request', 'أدخل البريد أو اسم المستخدم أو رقم الهاتف مع كلمة المرور.', 400)
  }
  const normalized = identifier.toLowerCase()
  const phone = normalizePhone(identifier)
  const ip = await getClientIp()
  const identifiers: Array<[string, string | null | undefined]> = [['identifier-ip', normalized + ':' + ip], ['identifier', normalized]]
  const flood = await isRequestFlooded([['identifier', normalized], ['ip', ip]])
  if (flood.blocked) return apiError('rate_limited', 'محاولات كثيرة. حاول بعد قليل.', 429)
  const lock = await checkPasswordLock(identifiers)
  if (lock.blocked) return apiError('login_locked', 'تم إيقاف محاولات الدخول مؤقتًا.', 429)

  const identityCondition = normalized.includes('@')
    ? eq(users.email, normalized)
    : /^07\d{9}$/.test(phone)
      ? eq(users.phone, phone)
      : eq(users.username, normalized)
  const [user] = await requireDb().select().from(users).where(identityCondition).limit(1)
  const valid = verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
  if (!user || !user.isActive || !valid) {
    await recordPasswordFailure(identifiers)
    return apiError('invalid_credentials', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', 401)
  }
  if (expectedRole && user.role !== expectedRole) {
    return apiError('role_mismatch', 'هذا الحساب لا يطابق نوع الدخول المختار.', 403)
  }

  await clearPasswordFailures(identifiers)
  if (user.role === 'admin' && user.twoFactorEnabled) {
    const challenge = await createApiChallenge(user.id)
    return apiJson({ requiresTwoFactor: true, challengeToken: challenge.token, expiresAt: challenge.expiresAt })
  }

  const session = await createApiSession(user.id)
  return apiJson({ requiresTwoFactor: false, accessToken: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: safeUser(user, getSiteBaseUrl(request)) })
}
