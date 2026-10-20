import 'server-only'
import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { requireDb } from '@/db'
import { authChallenges, sessions, users } from '@/db/schema'
import { decryptTotpSecret, hashRecoveryCode, normaliseRecoveryCode, verifyTotpCode } from '@/lib/totp'

const COOKIE = 'school_pulse_session'
const CHALLENGE_COOKIE = 'school_pulse_2fa_challenge'
const SESSION_DAYS = 14
const CHALLENGE_MINUTES = 10
const MAX_CHALLENGE_ATTEMPTS = 8

function secret() {
  const value = process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production' && !value) throw new Error('SESSION_SECRET is required in production.')
  return value || 'development-only-change-me'
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex')
  const a = Buffer.from(candidate, 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function signValue(value: string) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex')
}

function makeSignedToken(token: string) {
  return `${token}.${signValue(token)}`
}

function readSignedToken(value?: string) {
  if (!value) return null
  const [token, signature] = value.split('.')
  if (!token || !signature) return null
  const expected = signValue(token)
  if (signature.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  return token
}

export async function createSession(userId: string) {
  const database = requireDb()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
  await database.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt })
  const store = await cookies()
  store.set(COOKIE, makeSignedToken(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSession() {
  const store = await cookies()
  const raw = store.get(COOKIE)?.value
  const token = readSignedToken(raw)
  if (token) await requireDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  store.delete(COOKIE)
}

export async function createTwoFactorChallenge(userId: string) {
  const database = requireDb()
  await database.delete(authChallenges).where(lt(authChallenges.expiresAt, new Date()))
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60000)
  await database.insert(authChallenges).values({ tokenHash: hashToken(token), userId, expiresAt, attempts: 0 })
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, makeSignedToken(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

async function getChallenge() {
  const store = await cookies()
  const token = readSignedToken(store.get(CHALLENGE_COOKIE)?.value)
  if (!token) return null
  const row = await requireDb().select({ challenge: authChallenges, user: users })
    .from(authChallenges)
    .innerJoin(users, eq(users.id, authChallenges.userId))
    .where(and(eq(authChallenges.tokenHash, hashToken(token)), gt(authChallenges.expiresAt, new Date())))
    .limit(1)
  return row[0] ?? null
}

export async function clearTwoFactorChallenge() {
  const store = await cookies()
  const token = readSignedToken(store.get(CHALLENGE_COOKIE)?.value)
  if (token) await requireDb().delete(authChallenges).where(eq(authChallenges.tokenHash, hashToken(token)))
  store.delete(CHALLENGE_COOKIE)
}

export async function verifyTwoFactorChallenge(code: string) {
  const result = await getChallenge()
  if (!result || !result.user.isActive || result.user.role !== 'admin') return { ok: false, reason: 'expired' as const }

  const database = requireDb()
  const [attempt] = await database.update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(and(
      eq(authChallenges.id, result.challenge.id),
      lt(authChallenges.attempts, MAX_CHALLENGE_ATTEMPTS),
      gt(authChallenges.expiresAt, new Date())
    ))
    .returning({ attempts: authChallenges.attempts })

  if (!attempt) {
    await clearTwoFactorChallenge()
    return { ok: false, reason: 'locked' as const }
  }

  const encrypted = result.user.twoFactorSecretEncrypted
  const totpSecret = decryptTotpSecret(encrypted)
  if (!totpSecret || !result.user.twoFactorEnabled) {
    await clearTwoFactorChallenge()
    return { ok: false, reason: 'not-configured' as const }
  }

  const supplied = normaliseRecoveryCode(code)
  const recoveryCodes = Array.isArray(result.user.twoFactorRecoveryCodes) ? result.user.twoFactorRecoveryCodes : []
  const recoveryHash = hashRecoveryCode(supplied)
  const recoveryIndex = recoveryCodes.indexOf(recoveryHash)
  const validTotp = verifyTotpCode(totpSecret, supplied)

  if (validTotp || recoveryIndex >= 0) {
    const [consumed] = await database.delete(authChallenges)
      .where(eq(authChallenges.id, result.challenge.id))
      .returning({ id: authChallenges.id })
    if (!consumed) {
      await clearTwoFactorChallenge()
      return { ok: false, reason: 'expired' as const }
    }

    const store = await cookies()
    store.delete(CHALLENGE_COOKIE)

    if (recoveryIndex >= 0 && !validTotp) {
      const remaining = recoveryCodes.filter((_, index) => index !== recoveryIndex)
      const [recoveryCodeConsumed] = await database.update(users)
        .set({ twoFactorRecoveryCodes: remaining, updatedAt: new Date() })
        .where(and(
          eq(users.id, result.user.id),
          eq(users.twoFactorRecoveryCodes, recoveryCodes)
        ))
        .returning({ id: users.id })
      if (!recoveryCodeConsumed) return { ok: false, reason: 'expired' as const }
    }

    await createSession(result.user.id)
    return { ok: true as const, usedRecoveryCode: recoveryIndex >= 0 && !validTotp }
  }

  if (attempt.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    await clearTwoFactorChallenge()
    return { ok: false, reason: 'locked' as const }
  }
  return { ok: false, reason: 'invalid' as const, attemptsRemaining: MAX_CHALLENGE_ATTEMPTS - attempt.attempts }
}

export async function getCurrentUser() {
  if (!dbAvailable()) return null
  const store = await cookies()
  const token = readSignedToken(store.get(COOKIE)?.value)
  if (!token) return null
  const row = await requireDb().select({ user: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.isActive, true))).limit(1)
  return row[0]?.user ?? null
}

function dbAvailable() {
  return Boolean(process.env.DATABASE_URL)
}

export async function requireRole(role: 'student' | 'teacher' | 'admin') {
  const user = await getCurrentUser()
  if (!user || user.role !== role || !user.isActive) throw new Error('UNAUTHORIZED')
  return user
}

export async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || !user.isActive) return null
  return user
}
