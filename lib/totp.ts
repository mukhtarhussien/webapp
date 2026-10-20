import 'server-only'
import crypto from 'node:crypto'

const PERIOD = 30
const DIGITS = 6
const ISSUER = 'School Pulse'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20))
}

function encodeBase32(buffer: Buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let current = 0
  const bytes: number[] = []
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index < 0) continue
    current = (current << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function createTotpCode(secret: string, timestamp = Date.now(), offset = 0) {
  const key = decodeBase32(secret)
  const counter = Math.floor(timestamp / 1000 / PERIOD) + offset
  const counterBuffer = Buffer.alloc(8)
  let moving = counter
  for (let i = 7; i >= 0; i -= 1) {
    counterBuffer[i] = moving & 0xff
    moving = Math.floor(moving / 256)
  }
  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest()
  const index = digest[digest.length - 1] & 0x0f
  const binary = ((digest[index] & 0x7f) * 0x1000000) +
    (digest[index + 1] * 0x10000) +
    (digest[index + 2] * 0x100) +
    digest[index + 3]
  return String(binary % (10 ** DIGITS)).padStart(DIGITS, '0')
}

export function verifyTotpCode(secret: string, input: string, timestamp = Date.now()) {
  const token = input.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(token)) return false
  for (const offset of [-1, 0, 1]) {
    const candidate = createTotpCode(secret, timestamp, offset)
    const a = Buffer.from(candidate)
    const b = Buffer.from(token)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return false
}

export function buildTotpUri(secret: string, email: string) {
  const label = `${ISSUER}:${email}`
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

function encryptionKey() {
  const material = process.env.SESSION_SECRET || 'development-only-change-me'
  return crypto.createHash('sha256').update(`school-pulse-totp:${material}`).digest()
}

export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decryptTotpSecret(value: string | null | undefined) {
  if (!value) return null
  try {
    const [ivHex, tagHex, cipherHex] = value.split(':')
    if (!ivHex || !tagHex || !cipherHex) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase()
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
  })
}

export function hashRecoveryCode(code: string) {
  return crypto.createHash('sha256').update(code.replace(/-/g, '').trim().toUpperCase()).digest('hex')
}

export function normaliseRecoveryCode(code: string) {
  return code.replace(/\s+/g, '').trim().toUpperCase()
}
