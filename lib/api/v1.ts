import 'server-only'
import crypto from 'node:crypto'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireDb } from '@/db'
import { authChallenges, sessions, users, type User } from '@/db/schema'
import { decryptTotpSecret, hashRecoveryCode, normaliseRecoveryCode, verifyTotpCode } from '@/lib/totp'

export const API_VERSION = '1'
const SESSION_DAYS = 14
const MAX_CHALLENGE_ATTEMPTS = 8

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function apiJson(data: unknown, status = 200) {
  return NextResponse.json(
    { ok: true, data, meta: { apiVersion: API_VERSION } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export function apiError(code: string, message: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) }, meta: { apiVersion: API_VERSION } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function safeUser(user: User, baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '') {
  return {
    id: user.id,
    email: user.email.endsWith('@school-pulse.invalid') ? null : user.email,
    username: user.username,
    fullName: { ar: user.fullNameAr, en: user.fullNameEn },
    role: user.role,
    studentNumber: user.studentNumber,
    phone: user.phone,
    classId: user.classId,
    preferences: {
      notificationsMuted: Boolean(user.preferences?.notificationsMuted),
      profilePhotoUrl: user.preferences?.profilePhotoKey ? baseUrl + '/api/profile-photo/' + user.id : null,
      appearance: user.preferences?.appearance ?? null,
      blockedUserIds: user.preferences?.blockedUserIds ?? [],
    },
  }
}

export async function createApiSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
  await requireDb().insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt })
  return { token, expiresAt }
}

export async function getApiSession(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(authorization)
  if (!match) return null
  const [result] = await requireDb().select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(
      eq(sessions.tokenHash, hashToken(match[1])),
      gt(sessions.expiresAt, new Date()),
      eq(users.isActive, true),
    ))
    .limit(1)
  return result ?? null
}

export async function getApiUser(request: Request) {
  return (await getApiSession(request))?.user ?? null
}

export async function revokeApiSession(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(authorization)
  if (!match) return false
  await requireDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(match[1])))
  return true
}

export async function createApiChallenge(userId: string) {
  const db = requireDb()
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, new Date()))
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60000)
  await db.insert(authChallenges).values({ tokenHash: hashToken(token), userId, expiresAt, attempts: 0 })
  return { token, expiresAt }
}

export async function verifyApiChallenge(challengeToken: string, code: string) {
  if (!/^[a-f0-9]{64}$/i.test(challengeToken)) return { ok: false as const, reason: 'expired' }
  const db = requireDb()
  const [result] = await db.select({ challenge: authChallenges, user: users })
    .from(authChallenges)
    .innerJoin(users, eq(users.id, authChallenges.userId))
    .where(and(
      eq(authChallenges.tokenHash, hashToken(challengeToken)),
      gt(authChallenges.expiresAt, new Date()),
      eq(users.isActive, true),
    ))
    .limit(1)
  if (!result || result.user.role !== 'admin' || !result.user.twoFactorEnabled) return { ok: false as const, reason: 'expired' }

  const [attempt] = await db.update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(and(
      eq(authChallenges.id, result.challenge.id),
      gt(authChallenges.expiresAt, new Date()),
      sql`${authChallenges.attempts} < ${MAX_CHALLENGE_ATTEMPTS}`,
    ))
    .returning({ attempts: authChallenges.attempts })
  if (!attempt) {
    await db.delete(authChallenges).where(eq(authChallenges.id, result.challenge.id))
    return { ok: false as const, reason: 'locked' }
  }

  const supplied = normaliseRecoveryCode(code)
  const recoveryCodes = Array.isArray(result.user.twoFactorRecoveryCodes) ? result.user.twoFactorRecoveryCodes : []
  const recoveryIndex = recoveryCodes.indexOf(hashRecoveryCode(supplied))
  const totpSecret = decryptTotpSecret(result.user.twoFactorSecretEncrypted)
  const validTotp = Boolean(totpSecret && verifyTotpCode(totpSecret!, supplied))

  if (validTotp || recoveryIndex >= 0) {
    const [consumed] = await db.delete(authChallenges).where(eq(authChallenges.id, result.challenge.id)).returning({ id: authChallenges.id })
    if (!consumed) return { ok: false as const, reason: 'expired' }
    if (recoveryIndex >= 0 && !validTotp) {
      const remaining = recoveryCodes.filter((_, index) => index !== recoveryIndex)
      const [recoveryConsumed] = await db.update(users).set({ twoFactorRecoveryCodes: remaining, updatedAt: new Date() })
        .where(and(eq(users.id, result.user.id), eq(users.twoFactorRecoveryCodes, recoveryCodes)))
        .returning({ id: users.id })
      if (!recoveryConsumed) return { ok: false as const, reason: 'expired' }
    }
    return { ok: true as const, user: result.user }
  }

  if (attempt.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    await db.delete(authChallenges).where(eq(authChallenges.id, result.challenge.id))
    return { ok: false as const, reason: 'locked' }
  }
  return { ok: false as const, reason: 'invalid', attemptsRemaining: MAX_CHALLENGE_ATTEMPTS - attempt.attempts }
}

export function getSiteBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.protocol === 'https:' || process.env.NODE_ENV !== 'production') return url.origin
    } catch {
      // Fall back to the request origin when the optional URL is malformed.
    }
  }
  return new URL(request.url).origin
}
