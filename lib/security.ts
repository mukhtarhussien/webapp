import 'server-only'
import crypto from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { requireDb } from '@/db'
import { loginAttempts } from '@/db/schema'

const FLOOD_LIMIT = 30
const FLOOD_WINDOW_MS = 1000
const FLOOD_BLOCK_MS = 15 * 60 * 1000
const PASSWORD_MAX_FAILURES = 5
const PASSWORD_WINDOW_MS = 10 * 60 * 1000
const PASSWORD_BLOCK_MS = 15 * 60 * 1000

function securitySecret() {
  const value = process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production' && !value) throw new Error('SESSION_SECRET is required in production.')
  return value || 'development-only-change-me'
}

export function normalizePhone(value: string) {
  const raw = value.trim().replace(/[\s()-]/g, '')
  if (raw.startsWith('+964')) return `0${raw.slice(4)}`
  if (raw.startsWith('964')) return `0${raw.slice(3)}`
  return raw
}

export function isValidIraqiPhone(value: string) {
  return /^07\d{9}$/.test(normalizePhone(value))
}

export function normalizeFullName(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function isValidTripleName(value: string) {
  const parts = normalizeFullName(value).split(' ').filter(Boolean)
  return parts.length >= 3 && parts.length <= 6 && parts.every(part => /^\p{L}[\p{L}\p{M}'’-]*$/u.test(part))
}

export function securityKey(scope: string, identifier: string) {
  return crypto.createHmac('sha256', securitySecret()).update(`${scope}:${identifier.trim().toLowerCase()}`).digest('hex')
}

export async function getClientIp() {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || h.get('x-real-ip')?.trim() || 'unknown'
}

export async function isRequestFlooded(identifiers: Array<[string, string | null | undefined]>) {
  const database = requireDb()
  const now = new Date()
  const windowFloor = new Date(now.getTime() - FLOOD_WINDOW_MS)
  const blockedUntil = new Date(now.getTime() + FLOOD_BLOCK_MS)
  const keys = identifiers
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([scope, value]) => securityKey(scope, value!))
  if (!keys.length) return { blocked: false, retryAt: null as Date | null }

  let retryAt: Date | null = null
  for (const keyHash of [...new Set(keys)]) {
    const rows = await database.execute(sql`
      insert into request_rate_limits (key_hash, window_started_at, request_count, blocked_until, updated_at)
      values (${keyHash}, ${now}, 1, null, ${now})
      on conflict (key_hash) do update set
        request_count = case
          when request_rate_limits.blocked_until > ${now} then request_rate_limits.request_count
          when request_rate_limits.window_started_at < ${windowFloor} then 1
          else request_rate_limits.request_count + 1
        end,
        window_started_at = case
          when request_rate_limits.blocked_until > ${now} then request_rate_limits.window_started_at
          when request_rate_limits.window_started_at < ${windowFloor} then ${now}
          else request_rate_limits.window_started_at
        end,
        blocked_until = case
          when request_rate_limits.blocked_until > ${now} then request_rate_limits.blocked_until
          when request_rate_limits.window_started_at >= ${windowFloor}
            and request_rate_limits.request_count + 1 >= ${FLOOD_LIMIT} then ${blockedUntil}
          else null
        end,
        updated_at = ${now}
      returning blocked_until
    `)
    const row = Array.isArray(rows) ? rows[0] as { blocked_until: Date | null } | undefined : undefined
    if (row?.blocked_until && row.blocked_until.getTime() > Date.now()) {
      retryAt = retryAt && retryAt.getTime() > row.blocked_until.getTime() ? retryAt : row.blocked_until
    }
  }

  return { blocked: Boolean(retryAt), retryAt }
}

export async function checkPasswordLock(identifiers: Array<[string, string | null | undefined]>) {
  const database = requireDb()
  const now = new Date()
  let blockedUntil: Date | null = null
  for (const [scope, value] of identifiers) {
    if (!value?.trim()) continue
    const keyHash = securityKey(scope, value)
    const rows = await database.execute(sql`
      select blocked_until from login_attempts where key_hash = ${keyHash} and blocked_until > ${now} limit 1
    `)
    const row = Array.isArray(rows) ? rows[0] as { blocked_until: Date | null } | undefined : undefined
    if (row?.blocked_until) {
      const candidate = new Date(row.blocked_until)
      if (!blockedUntil || candidate.getTime() > blockedUntil.getTime()) blockedUntil = candidate
    }
  }
  return { blocked: Boolean(blockedUntil), blockedUntil }
}

export async function recordPasswordFailure(identifiers: Array<[string, string | null | undefined]>) {
  const database = requireDb()
  const now = new Date()
  const windowFloor = new Date(now.getTime() - PASSWORD_WINDOW_MS)
  const blockedUntil = new Date(now.getTime() + PASSWORD_BLOCK_MS)
  let lockedUntil: Date | null = null

  for (const [scope, value] of identifiers) {
    if (!value?.trim()) continue
    const keyHash = securityKey(scope, value)
    const rows = await database.execute(sql`
      insert into login_attempts (key_hash, failures, first_failed_at, blocked_until, updated_at)
      values (${keyHash}, 1, ${now}, null, ${now})
      on conflict (key_hash) do update set
        failures = case
          when login_attempts.blocked_until > ${now} then login_attempts.failures
          when login_attempts.first_failed_at < ${windowFloor} then 1
          else login_attempts.failures + 1
        end,
        first_failed_at = case
          when login_attempts.blocked_until > ${now} then login_attempts.first_failed_at
          when login_attempts.first_failed_at < ${windowFloor} then ${now}
          else login_attempts.first_failed_at
        end,
        blocked_until = case
          when login_attempts.blocked_until > ${now} then login_attempts.blocked_until
          when login_attempts.first_failed_at >= ${windowFloor}
            and login_attempts.failures + 1 >= ${PASSWORD_MAX_FAILURES} then ${blockedUntil}
          else null
        end,
        updated_at = ${now}
      returning blocked_until
    `)
    const row = Array.isArray(rows) ? rows[0] as { blocked_until: Date | null } | undefined : undefined
    if (row?.blocked_until && row.blocked_until.getTime() > Date.now()) {
      lockedUntil = lockedUntil && lockedUntil.getTime() > row.blocked_until.getTime() ? lockedUntil : row.blocked_until
    }
  }
  return { blocked: Boolean(lockedUntil), blockedUntil: lockedUntil }
}

export async function clearPasswordFailures(identifiers: Array<[string, string | null | undefined]>) {
  const database = requireDb()
  for (const [scope, value] of identifiers) {
    if (!value?.trim()) continue
    await database.delete(loginAttempts).where(eq(loginAttempts.keyHash, securityKey(scope, value)))
  }
}
