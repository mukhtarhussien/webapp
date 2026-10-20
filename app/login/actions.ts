'use server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { checkPasswordLock, clearPasswordFailures, getClientIp, isRequestFlooded, normalizePhone, recordPasswordFailure } from '@/lib/security'
import { clearTwoFactorChallenge, createSession, createTwoFactorChallenge, hashPassword, verifyPassword, verifyTwoFactorChallenge } from '@/lib/auth'
import { clearAdminGoogleLoginIdentity, getAdminGoogleLoginIdentity } from '@/lib/google'

const DUMMY_PASSWORD_HASH = hashPassword('school-pulse-dummy-password')

export async function loginAction(formData: FormData) {
  const loginRole = String(formData.get('loginRole') || 'student')
  const adminGoogleIdentity = loginRole === 'admin' ? await getAdminGoogleLoginIdentity() : null
  const identifier = String(formData.get('identifier') || formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  if (!identifier || !password) redirect(`/login?error=missing&role=${loginRole === 'admin' ? 'admin' : loginRole === 'teacher' ? 'teacher' : 'student'}`)
  const normalized = identifier.toLowerCase()
  const phone = normalizePhone(identifier)
  const ip = await getClientIp()
  const flood = await isRequestFlooded([['login-identifier', normalized], ['login-ip', ip]])
  if (flood.blocked) redirect(`/login?error=rate_limited&role=${loginRole === 'admin' ? 'admin' : loginRole === 'teacher' ? 'teacher' : 'student'}`)
  const passwordLock = await checkPasswordLock([['identifier-ip', `${normalized}:${ip}`], ['identifier', normalized]])
  if (passwordLock.blocked) redirect(`/login?error=password_locked&role=${loginRole === 'admin' ? 'admin' : loginRole === 'teacher' ? 'teacher' : 'student'}`)

  const identityCondition = normalized.includes('@')
      ? eq(users.email, normalized)
    : /^07\d{9}$/.test(phone)
      ? eq(users.phone, phone)
      : eq(users.username, normalized)
  const rows = await requireDb().select().from(users).where(identityCondition).limit(1)
  const user = rows[0]
  const passwordValid = verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
  const roleAllowed = user?.role === loginRole && (loginRole === 'student' || loginRole === 'teacher' || loginRole === 'admin')
  const googleIdentityMatches = !adminGoogleIdentity || normalized !== adminGoogleIdentity.email || !user?.googleSubject || user.googleSubject === adminGoogleIdentity.googleSubject
  if (!user || !user.isActive || !passwordValid || !roleAllowed || !googleIdentityMatches) {
    const result = await recordPasswordFailure([['identifier-ip', `${normalized}:${ip}`], ['identifier', normalized]])
    redirect(`/login?error=${result.blocked ? 'password_locked' : 'invalid'}&role=${loginRole === 'admin' ? 'admin' : loginRole === 'teacher' ? 'teacher' : 'student'}`)
  }
  await clearPasswordFailures([['identifier-ip', `${normalized}:${ip}`], ['identifier', normalized]])
  if (adminGoogleIdentity && normalized === adminGoogleIdentity.email && !user.googleSubject) {
    await requireDb().update(users).set({ googleSubject: adminGoogleIdentity.googleSubject, updatedAt: new Date() }).where(eq(users.id, user.id))
  }
  if (adminGoogleIdentity) await clearAdminGoogleLoginIdentity()
  if (user.role === 'admin' && user.twoFactorEnabled) {
    await createTwoFactorChallenge(user.id)
    redirect('/login/2fa')
  }
  await createSession(user.id)
  redirect(user.role === 'admin' ? '/admin/security?setup=1' : '/')
}

export async function verifyTwoFactorAction(formData: FormData) {
  const code = String(formData.get('code') || '')
  if (!code) redirect('/login/2fa?error=missing')
  const result = await verifyTwoFactorChallenge(code)
  if (!result.ok) redirect(`/login/2fa?error=${result.reason}`)
  redirect('/admin')
}

export async function cancelTwoFactorAction() {
  await clearTwoFactorChallenge()
  redirect('/login')
}
