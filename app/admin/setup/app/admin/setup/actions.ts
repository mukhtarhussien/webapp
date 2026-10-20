'use server'

import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { createSession, hashPassword } from '@/lib/auth'
import { getClientIp, isRequestFlooded } from '@/lib/security'

export async function bootstrapAdminAction(formData: FormData) {
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase()
  const expected = process.env.ADMIN_BOOTSTRAP_SECRET || ''
  const supplied = String(formData.get('secret') || '')
  const password = String(formData.get('password') || '')

  if (!email || expected.length < 32 || process.env.NODE_ENV !== 'production') {
    redirect('/admin/setup?error=disabled')
  }

  if (!supplied || supplied.length > 256 || !password || password.length < 12 || password.length > 128) {
    redirect('/admin/setup?error=invalid')
  }

  const ip = await getClientIp()
  const flood = await isRequestFlooded([
    ['admin-bootstrap-ip', ip],
    ['admin-bootstrap-email', email],
  ])

  if (flood.blocked) redirect('/admin/setup?error=limited')

  const a = Buffer.from(supplied, 'utf8')
  const b = Buffer.from(expected, 'utf8')

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    redirect('/admin/setup?error=invalid')
  }

  const db = requireDb()

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
    .limit(1)

  if (admins.length > 0) redirect('/admin/setup?error=used')

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing.length > 0) redirect('/admin/setup?error=account')

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

  if (!admin) redirect('/admin/setup?error=used')

  await createSession(admin.id)
  redirect('/admin/security?setup=1')
}
