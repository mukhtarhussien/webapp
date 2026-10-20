import 'server-only'
import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { and, desc, eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { registrationRequests, users } from '@/db/schema'
import { createSession } from '@/lib/auth'

const STATE_COOKIE = 'school_google_state'
const VERIFIER_COOKIE = 'school_google_verifier'
const ROLE_COOKIE = 'school_google_role'
const ADMIN_LOGIN_COOKIE = 'school_admin_google_login'
const REGISTRATION_COOKIE = 'school_registration_state'
const COOKIE_MAX_AGE = 10 * 60

function appSecret() {
  const value = process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production' && !value) throw new Error('SESSION_SECRET is required in production.')
  return value || 'development-only-change-me'
}

function sign(value: string) {
  return crypto.createHmac('sha256', appSecret()).update(value).digest('base64url')
}

function signed(value: string) {
  return `${value}.${sign(value)}`
}

function verifySigned(value: string | undefined) {
  if (!value) return null
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  if (signature.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  } catch {
    return null
  }
  return payload
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeJson<T>(value: string): T | null {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T } catch { return null }
}

function cookieOptions(path: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path,
    maxAge: COOKIE_MAX_AGE,
  }
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function getGoogleRedirectUri(origin?: string) {
  if (process.env.NODE_ENV === 'production' && !process.env.GOOGLE_REDIRECT_URI) throw new Error('GOOGLE_REDIRECT_URI is required in production.')
  return process.env.GOOGLE_REDIRECT_URI || `${origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google/callback`
}

export async function beginGoogleOAuth(origin: string, requestedRole: 'student' | 'teacher' | 'admin' = 'student') {
  if (!googleConfigured()) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED')
  const state = crypto.randomBytes(32).toString('base64url')
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const uri = getGoogleRedirectUri(origin)
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: uri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
  })
  const store = await cookies()
  store.set(STATE_COOKIE, signed(state), cookieOptions('/api/auth/google/callback'))
  store.set(VERIFIER_COOKIE, signed(verifier), cookieOptions('/api/auth/google/callback'))
  store.set(ROLE_COOKIE, signed(requestedRole), cookieOptions('/api/auth/google/callback'))
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function readGoogleOAuthState() {
  const store = await cookies()
  const state = verifySigned(store.get(STATE_COOKIE)?.value)
  const verifier = verifySigned(store.get(VERIFIER_COOKIE)?.value)
  const requestedRole = verifySigned(store.get(ROLE_COOKIE)?.value)
  store.delete(STATE_COOKIE)
  store.delete(VERIFIER_COOKIE)
  store.delete(ROLE_COOKIE)
  if (!state || !verifier) return null
  return { state, verifier, requestedRole: requestedRole === 'admin' ? 'admin' as const : requestedRole === 'teacher' ? 'teacher' as const : 'student' as const }
}


export async function setAdminGoogleLoginIdentity(identity: { userId: string; email: string; googleSubject: string }) {
  const payload = encodeJson({ ...identity, exp: Date.now() + COOKIE_MAX_AGE * 1000 })
  const store = await cookies()
  store.set(ADMIN_LOGIN_COOKIE, signed(payload), cookieOptions('/login'))
}

export async function getAdminGoogleLoginIdentity() {
  const store = await cookies()
  const payload = verifySigned(store.get(ADMIN_LOGIN_COOKIE)?.value)
  if (!payload) return null
  const identity = decodeJson<{ userId: string; email: string; googleSubject: string; exp: number }>(payload)
  if (!identity || identity.exp <= Date.now() || !identity.userId || !identity.email || !identity.googleSubject) return null
  return identity
}

export async function clearAdminGoogleLoginIdentity() {
  const store = await cookies()
  store.set(ADMIN_LOGIN_COOKIE, '', { ...cookieOptions('/login'), maxAge: 0 })
}

export async function exchangeGoogleCode(code: string, verifier: string, origin: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getGoogleRedirectUri(origin),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    cache: 'no-store',
  })
  if (!response.ok) return null
  return response.json() as Promise<{ access_token?: string }>
}

export type GoogleProfile = {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
}

export async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!response.ok) return null
  const data = await response.json() as GoogleProfile
  if (!data.sub || !data.email || data.email_verified !== true) return null
  return data
}

export function setRegistrationCookie(requestId: string, googleSubject: string) {
  return (async () => {
    const payload = encodeJson({ requestId, googleSubject, exp: Date.now() + COOKIE_MAX_AGE * 1000 })
    const store = await cookies()
    store.set(REGISTRATION_COOKIE, signed(payload), { ...cookieOptions('/register'), maxAge: COOKIE_MAX_AGE })
  })()
}

export async function clearRegistrationCookie() {
  const store = await cookies()
  store.delete(REGISTRATION_COOKIE)
}

export async function getRegistrationContext() {
  const store = await cookies()
  const payload = verifySigned(store.get(REGISTRATION_COOKIE)?.value)
  if (!payload) return null
  const data = decodeJson<{ requestId:string; googleSubject:string; exp:number }>(payload)
  if (!data || data.exp < Date.now() || !data.requestId || !data.googleSubject) return null
  const row = await requireDb().select().from(registrationRequests)
    .where(and(eq(registrationRequests.id, data.requestId), eq(registrationRequests.googleSubject, data.googleSubject)))
    .limit(1)
  return row[0] ?? null
}

export async function resolveGoogleLogin(profile: GoogleProfile, requestedRole: 'student' | 'teacher' | 'admin' = 'student') {
  const database = requireDb()
  const email = profile.email.trim().toLowerCase()
  const byGoogle = await database.select().from(users).where(eq(users.googleSubject, profile.sub)).limit(1)
  const googleUser = byGoogle[0]
  if (googleUser) {
    if (!googleUser.isActive) return { kind: 'inactive' as const }
    if (googleUser.role === 'admin') return requestedRole === 'admin' ? { kind: 'admin-password' as const, userId: googleUser.id } : { kind: 'wrong-role' as const }
    if (requestedRole === 'admin' || googleUser.role !== requestedRole) return { kind: 'wrong-role' as const }
    await createSession(googleUser.id)
    return { kind: 'signed-in' as const }
  }

  const byEmail = await database.select().from(users).where(eq(users.email, email)).limit(1)
  const emailUser = byEmail[0]
  if (emailUser) {
    if (!emailUser.isActive) return { kind: 'inactive' as const }
    if (emailUser.role === 'admin') {
      if (emailUser.googleSubject && emailUser.googleSubject !== profile.sub) return { kind: 'wrong-role' as const }
      return requestedRole === 'admin' ? { kind: 'admin-password' as const, userId: emailUser.id } : { kind: 'wrong-role' as const }
    }
    if (requestedRole === 'admin' || emailUser.role !== requestedRole) return { kind: 'wrong-role' as const }
    await database.update(users).set({ googleSubject: profile.sub, updatedAt: new Date() }).where(eq(users.id, emailUser.id))
    await createSession(emailUser.id)
    return { kind: 'signed-in' as const }
  }

  if (requestedRole === 'admin') return { kind: 'wrong-role' as const }

  const recent = await database.select().from(registrationRequests)
    .where(eq(registrationRequests.googleSubject, profile.sub))
    .orderBy(desc(registrationRequests.createdAt)).limit(1)
  let existing = recent[0]
  if (!existing) {
    const [matchingEmailRequest] = await database.select().from(registrationRequests)
      .where(and(eq(registrationRequests.email, email), eq(registrationRequests.status, 'pending')))
      .orderBy(desc(registrationRequests.createdAt)).limit(1)
    if (matchingEmailRequest && matchingEmailRequest.requestedRole !== requestedRole) return { kind: 'wrong-role' as const }
    if (matchingEmailRequest) {
      existing = matchingEmailRequest
      await database.update(registrationRequests).set({ googleSubject: profile.sub, googleName: profile.name?.trim().slice(0, 160) || null, updatedAt: new Date() }).where(eq(registrationRequests.id, matchingEmailRequest.id))
    }
  }
  if (existing && (existing.status === 'draft' || existing.status === 'pending')) {
    const role = existing.status === 'pending' ? existing.requestedRole : requestedRole
    if (existing.status === 'draft' && existing.requestedRole !== role) {
      await database.update(registrationRequests).set({ requestedRole: role, updatedAt: new Date() }).where(eq(registrationRequests.id, existing.id))
    }
    await setRegistrationCookie(existing.id, profile.sub)
    return { kind: existing.status as 'draft' | 'pending', requestId: existing.id, role }
  }

  const [draft] = await database.insert(registrationRequests).values({
    googleSubject: profile.sub,
    email,
    googleName: profile.name?.trim().slice(0, 160) || null,
    requestedRole,
    status: 'draft',
  }).returning({ id: registrationRequests.id })
  await setRegistrationCookie(draft.id, profile.sub)
  return { kind: 'draft' as const, requestId: draft.id, role: requestedRole }
}
