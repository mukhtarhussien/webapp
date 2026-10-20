'use server'

import crypto from 'node:crypto'
import { redirect } from 'next/navigation'
import { and, eq, or, type SQL } from 'drizzle-orm'
import { requireDb } from '@/db'
import { classes, notifications, registrationRequests, subjects, users } from '@/db/schema'
import { getRegistrationContext } from '@/lib/google'
import { hashPassword } from '@/lib/auth'
import { getClientIp, isRequestFlooded, isValidIraqiPhone, isValidTripleName, normalizeFullName, normalizePhone } from '@/lib/security'

const value = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date <= new Date()
}

export async function submitRegistrationAction(fd: FormData) {
  const request = await getRegistrationContext()
  if (!request) redirect('/login?error=registration_expired')
  if (request.status !== 'draft') redirect('/register')

  const fullName = normalizeFullName(value(fd, 'fullName'))
  const birthDate = value(fd, 'birthDate')
  const phone = normalizePhone(value(fd, 'phone'))
  const classId = value(fd, 'classId')
  const subjectId = value(fd, 'subjectId')
  const requestedRole = request.requestedRole === 'teacher' ? 'teacher' : 'student'

  const flood = await isRequestFlooded([
    ['google', request.googleSubject],
    ['email', request.email],
    ['phone', phone],
    ['registration-ip', await getClientIp()],
  ])
  if (flood.blocked) redirect('/register?error=rate_limited')
  if (!isValidTripleName(fullName)) redirect('/register?error=name')
  if (!validBirthDate(birthDate)) redirect('/register?error=birth_date')
  if (!isValidIraqiPhone(phone)) redirect('/register?error=phone')

  const database = requireDb()
  if (requestedRole === 'teacher') {
    const [subject] = await database.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1)
    if (!subject) redirect('/register?role=teacher&error=subject')
  } else {
    const [classRow] = await database.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).limit(1)
    if (!classRow) redirect('/register?error=class')
  }

  const [existingPhone] = await database.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1)
  if (existingPhone) redirect(`/register?role=${requestedRole}&error=phone_taken`)
  const [duplicatePhone] = await database.select({ id: registrationRequests.id }).from(registrationRequests)
    .where(and(eq(registrationRequests.phone, phone), eq(registrationRequests.status, 'pending'))).limit(1)
  if (duplicatePhone) redirect(`/register?role=${requestedRole}&error=phone_pending`)

  await database.update(registrationRequests).set({
    requestedRole,
    fullName,
    birthDate,
    phone,
    classId: requestedRole === 'student' ? classId : null,
    subjectId: requestedRole === 'teacher' ? subjectId : null,
    status: 'pending',
    updatedAt: new Date(),
    rejectionReason: null,
  }).where(eq(registrationRequests.id, request.id))

  const admins = await database.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
  if (admins.length) {
    const teacher = requestedRole === 'teacher'
    await database.insert(notifications).values(admins.map(admin => ({
      userId: admin.id,
      titleAr: teacher ? 'طلب تسجيل مدرس جديد' : 'طلب تسجيل طالب جديد',
      titleEn: teacher ? 'New teacher registration request' : 'New student registration request',
      bodyAr: `${fullName} أرسل طلب تسجيل. الهاتف: ${phone}`,
      bodyEn: `${fullName} submitted a registration request. Phone: ${phone}`,
    })))
  }

  redirect(`/register?role=${requestedRole}&submitted=1`)
}

export async function submitPasswordRegistrationAction(fd: FormData) {
  const rawRole = value(fd, 'requestedRole')
  const role: 'student' | 'teacher' | 'admin' = rawRole === 'teacher' || rawRole === 'admin' ? rawRole : 'student'
  const roleQuery = `method=password&role=${role}`
  const fullName = normalizeFullName(value(fd, 'fullName'))
  const birthDate = value(fd, 'birthDate')
  const classId = value(fd, 'classId')
  const subjectId = value(fd, 'subjectId')
  const rawUsername = value(fd, 'username').toLowerCase()
  const email = value(fd, 'email').toLowerCase()
  const rawPhone = value(fd, 'phone')
  const phone = rawPhone ? normalizePhone(rawPhone) : ''
  const password = String(fd.get('password') ?? '')
  const passwordConfirm = String(fd.get('passwordConfirm') ?? '')

  if (!isValidTripleName(fullName)) redirect(`/register?${roleQuery}&error=name`)
  if (!validBirthDate(birthDate)) redirect(`/register?${roleQuery}&error=birth_date`)
  if (role === 'student' && !classId) redirect(`/register?${roleQuery}&error=class`)
  if (role === 'teacher' && !subjectId) redirect(`/register?${roleQuery}&error=subject`)
  if (!rawUsername && !email && !phone) redirect(`/register?${roleQuery}&error=identifier`)
  if (role === 'admin' && !email) redirect(`/register?${roleQuery}&error=email_required`)
  if (rawUsername && !/^[a-z0-9._-]{3,32}$/.test(rawUsername)) redirect(`/register?${roleQuery}&error=username`)
  if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) redirect(`/register?${roleQuery}&error=email`)
  if (role === 'teacher' && !phone) redirect(`/register?${roleQuery}&error=phone`)
  if (phone && !isValidIraqiPhone(phone)) redirect(`/register?${roleQuery}&error=phone`)
  if (password.length < 8 || !/[A-Za-z\p{L}]/u.test(password) || !/\d/.test(password)) redirect(`/register?${roleQuery}&error=password`)
  if (password !== passwordConfirm) redirect(`/register?${roleQuery}&error=password_mismatch`)

  const database = requireDb()
  if (role === 'student') {
    const [classRow] = await database.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).limit(1)
    if (!classRow) redirect(`/register?${roleQuery}&error=class`)
  }
  if (role === 'teacher') {
    const [subjectRow] = await database.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1)
    if (!subjectRow) redirect(`/register?${roleQuery}&error=subject`)
  }

  const ip = await getClientIp()
  const flood = await isRequestFlooded([
    [`${role}-register-ip`, ip],
    [`${role}-register-email`, email],
    [`${role}-register-username`, rawUsername],
    [`${role}-register-phone`, phone],
  ])
  if (flood.blocked) redirect(`/register?${roleQuery}&error=rate_limited`)

  const loginEmail = email || `registration-${crypto.randomUUID()}@school-pulse.invalid`
  const userConditions: SQL[] = [eq(users.email, loginEmail)]
  if (rawUsername) userConditions.push(eq(users.username, rawUsername))
  if (phone) userConditions.push(eq(users.phone, phone))
  const [existingUser] = await database.select({ id: users.id }).from(users).where(or(...userConditions)).limit(1)
  if (existingUser) {
    if (email) redirect(`/register?${roleQuery}&error=email_taken`)
    if (rawUsername) redirect(`/register?${roleQuery}&error=username_taken`)
    redirect(`/register?${roleQuery}&error=phone_taken`)
  }

  const requestConditions: SQL[] = []
  if (email) requestConditions.push(eq(registrationRequests.email, email))
  if (rawUsername) requestConditions.push(eq(registrationRequests.username, rawUsername))
  if (phone) requestConditions.push(eq(registrationRequests.phone, phone))
  const [duplicate] = await database.select({ id: registrationRequests.id }).from(registrationRequests)
    .where(and(eq(registrationRequests.status, 'pending'), or(...requestConditions))).limit(1)
  if (duplicate) {
    if (email) redirect(`/register?${roleQuery}&error=email_taken`)
    if (rawUsername) redirect(`/register?${roleQuery}&error=username_taken`)
    redirect(`/register?${roleQuery}&error=phone_pending`)
  }

  await database.insert(registrationRequests).values({
    googleSubject: null,
    email: loginEmail,
    username: rawUsername || null,
    passwordHash: hashPassword(password),
    requestedRole: role,
    fullName,
    birthDate,
    phone: phone || null,
    classId: role === 'student' ? classId : null,
    subjectId: role === 'teacher' ? subjectId : null,
    status: 'pending',
  })

  const admins = await database.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
  if (admins.length) {
    const label = role === 'teacher' ? 'مدرس' : role === 'admin' ? 'مسؤول إدارة' : 'طالب'
    const labelEn = role === 'teacher' ? 'teacher' : role === 'admin' ? 'administrator' : 'student'
    await database.insert(notifications).values(admins.map(admin => ({
      userId: admin.id,
      titleAr: `طلب حساب ${label} جديد`,
      titleEn: `New ${labelEn} account request`,
      bodyAr: `${fullName} أرسل طلبًا لإنشاء حساب ${label}.`,
      bodyEn: `${fullName} submitted a ${labelEn} account request.`,
    })))
  }

  redirect(`/register?${roleQuery}&submitted=1`)
}
