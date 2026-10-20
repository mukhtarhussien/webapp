'use server'

import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { createSession, hashPassword } from '@/lib/auth'
import { getClientIp, isRequestFlooded } from '@/lib/security'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function bootstrapAdminAction(formData: FormData) {
  const expected = process.env.ADMIN_BOOTSTRAP_SECRET || ''
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const supplied = String(formData.get('secret') ?? '')
  const password = String(formData.get('password') ?? '')

  if (
    expected.length < 32 ||
    expected.length > 256 ||
    process.env.NODE_ENV !== 'production'
  ) {
    redirect('/admin/setup?error=disabled')
  }

  const ip = await getClientIp()

  const flood = await isRequestFlooded([
    ['admin-bootstrap-ip', ip],
    ['admin-bootstrap-email', email],
  ])

  if (flood.blocked) {
    redirect('/admin/setup?error=limited')
  }

  if (
    !EMAIL_PATTERN.test(email) ||
    email.length > 254 ||
    !supplied ||
    supplied.length > 256 ||
    !password.trim() ||
    password.length < 12 ||
    password.length > 128
  ) {
    redirect('/admin/setup?error=invalid')
  }

  const a = Buffer.from(supplied, 'utf8')
  const b = Buffer.from(expected, 'utf8')

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    redirect('/admin/setup?error=invalid')
  }

  const db = requireDb()

  // Close bootstrap if any admin account already exists,
  // including inactive accounts.
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1)

  if (admins.length > 0) {
    redirect('/admin/setup?error=used')
  }

  // Never silently promote an existing student or teacher.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing.length > 0) {
    redirect('/admin/setup?error=account')
  }

  const [admin] = await db
    .insert(users)
    .values({
      email,
      passwordHash: hashPassword(password),
      fullNameAr: 'مدير النظام',
      fullNameEn: 'System Administrator',
      role: 'admin',
      isActive: true,
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id })

  if (!admin) {
    redirect('/admin/setup?error=account')
  }

  await createSession(admin.id)

  redirect('/admin/security?setup=1')
}
