import crypto from 'node:crypto'
import { and, desc, eq, or, type SQL } from 'drizzle-orm'
import { requireDb } from '@/db'
import { classes, notifications, registrationRequests, subjects, users } from '@/db/schema'
import { apiError, apiJson, readJson } from '@/lib/api/v1'
import { hashPassword } from '@/lib/auth'
import { getClientIp, isRequestFlooded, isValidIraqiPhone, isValidTripleName, normalizeFullName, normalizePhone } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type GoogleTokenInfo = { aud?: string; iss?: string; exp?: string; sub?: string; email?: string; email_verified?: string; name?: string }

async function verifyGoogleToken(idToken: string) {
  const audiences = [process.env.GOOGLE_CLIENT_ID, ...(process.env.GOOGLE_MOBILE_CLIENT_IDS || '').split(',')].map(value => value?.trim()).filter((value): value is string => Boolean(value))
  if (!audiences.length) return { error: apiError('google_not_configured', 'تسجيل Google للتطبيق غير مهيأ على الخادم.', 503) }
  try {
    const endpoint = new URL('https://oauth2.googleapis.com/tokeninfo')
    endpoint.searchParams.set('id_token', idToken)
    const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!response.ok) return { error: apiError('invalid_google_token', 'تعذر التحقق من حساب Google.', 401) }
    const profile = await response.json() as GoogleTokenInfo
    const expiry = Number(profile.exp)
    if (!profile.sub || !profile.email || profile.email_verified !== 'true' || !audiences.includes(profile.aud || '') || !['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss || '') || !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000)) return { error: apiError('invalid_google_token', 'تعذر التحقق من حساب Google.', 401) }
    return { profile }
  } catch {
    return { error: apiError('google_unavailable', 'تعذر الاتصال بخدمة Google. حاول مرة ثانية.', 503) }
  }
}

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date <= new Date()
}

async function notifyAdmins(role: 'student' | 'teacher', fullName: string, phone: string | null) {
  const db = requireDb()
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
  if (!admins.length) return
  const teacher = role === 'teacher'
  await db.insert(notifications).values(admins.map(admin => ({
    userId: admin.id,
    titleAr: teacher ? 'طلب تسجيل مدرس جديد' : 'طلب تسجيل طالب جديد',
    titleEn: teacher ? 'New teacher registration request' : 'New student registration request',
    bodyAr: `${fullName} أرسل طلب تسجيل. الهاتف: ${phone || 'غير محدد'}`,
    bodyEn: `${fullName} submitted a registration request. Phone: ${phone || 'not provided'}`,
  })))
}

export async function GET() {
  const db = requireDb()
  const [classRows, subjectRows] = await Promise.all([
    db.select({ id: classes.id, nameAr: classes.nameAr, nameEn: classes.nameEn, gradeLevel: classes.gradeLevel, section: classes.section }).from(classes).orderBy(classes.gradeLevel, classes.nameAr),
    db.select({ id: subjects.id, nameAr: subjects.nameAr, nameEn: subjects.nameEn, code: subjects.code }).from(subjects).orderBy(subjects.nameAr),
  ])
  return apiJson({ classes: classRows, subjects: subjectRows })
}

export async function POST(request: Request) {
  const body = await readJson(request)
  if (!body) return apiError('invalid_json', 'صيغة الطلب غير صالحة.', 400)
  const db = requireDb()
  const role = body.requestedRole === 'teacher' ? 'teacher' : 'student'
  const method = body.method === 'password' ? 'password' : 'google'
  const fullName = normalizeFullName(String(body.fullName || ''))
  const birthDate = String(body.birthDate || '').trim()
  const rawPhone = String(body.phone || '').trim()
  const phone = rawPhone ? normalizePhone(rawPhone) : ''
  const classId = String(body.classId || '').trim()
  const subjectId = String(body.subjectId || '').trim()

  if (!isValidTripleName(fullName)) return apiError('invalid_name', 'اكتب الاسم الثلاثي باستخدام الحروف فقط.', 400)
  if (!validBirthDate(birthDate)) return apiError('invalid_birth_date', 'تاريخ الميلاد غير صالح.', 400)
  if (rawPhone && !isValidIraqiPhone(phone)) return apiError('invalid_phone', 'رقم الهاتف العراقي غير صالح.', 400)
  if (role === 'student' && !classId) return apiError('invalid_class', 'اختر الصف الدراسي.', 400)
  if (role === 'teacher' && (!subjectId || !classId)) return apiError('invalid_teacher_request', 'اختر المادة والصف الذي تدرّسه.', 400)

  if (role === 'student' || role === 'teacher') {
    const [classRow] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).limit(1)
    if (!classRow) return apiError('invalid_class', 'الصف المحدد غير موجود.', 400)
  }
  if (role === 'teacher') {
    const [subjectRow] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1)
    if (!subjectRow) return apiError('invalid_subject', 'المادة المحددة غير موجودة.', 400)
  }

  const ip = await getClientIp()
  let googleSubject: string | null = null
  let email = ''
  let googleName: string | null = null
  let username: string | null = null
  let passwordHash: string | null = null

  if (method === 'google') {
    const idToken = typeof body.idToken === 'string' ? body.idToken : ''
    if (!idToken || idToken.length > 8192) return apiError('invalid_request', 'رمز Google غير موجود أو غير صالح.', 400)
    const verified = await verifyGoogleToken(idToken)
    if ('error' in verified) return verified.error
    const profile = verified.profile
    googleSubject = profile.sub!
    email = profile.email!.trim().toLowerCase()
    googleName = profile.name?.trim().slice(0, 160) || null
    username = String(body.username || '').trim().toLowerCase() || null
    const password = typeof body.password === 'string' ? body.password : ''
    const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : ''
    if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) return apiError('invalid_username', 'اسم المستخدم يجب أن يكون من 3 إلى 32 رمزًا إنجليزيًا.', 400)
    if (password || passwordConfirm) {
      if (password.length < 8 || !/[A-Za-z\p{L}]/u.test(password) || !/\d/.test(password)) return apiError('weak_password', 'استخدم 8 أحرف على الأقل مع رقم.', 400)
      if (password !== passwordConfirm) return apiError('password_mismatch', 'كلمتا المرور غير متطابقتين.', 400)
      passwordHash = hashPassword(password)
    }
    const flood = await isRequestFlooded([['google', googleSubject], ['email', email], ['phone', phone], ['registration-ip', ip]])
    if (flood.blocked) return apiError('rate_limited', 'تم إيقاف الطلبات مؤقتًا بسبب كثرة المحاولات.', 429)

    const [existingUser] = await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(or(eq(users.email, email), eq(users.googleSubject, googleSubject))).limit(1)
    if (existingUser) return apiError(existingUser.isActive ? 'account_exists' : 'account_inactive', existingUser.isActive ? 'هذا البريد مرتبط بحساب في المدرسة. سجّل الدخول بدل إنشاء حساب جديد.' : 'الحساب غير مفعّل. تواصل مع إدارة المدرسة.', 409)
  } else {
    if (role !== 'student' && role !== 'teacher') return apiError('password_registration_not_supported', 'طريقة التسجيل غير مدعومة.', 400)
    username = String(body.username || '').trim().toLowerCase() || null
    const requestedEmail = String(body.email || '').trim().toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : ''
    if (role === 'teacher' && !requestedEmail) return apiError('identifier_required', 'أدخل البريد الإلكتروني للمدرس.', 400)
    if (!username && !requestedEmail && !phone) return apiError('identifier_required', 'أدخل رقم الهاتف أو اسم المستخدم أو البريد الإلكتروني.', 400)
    if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) return apiError('invalid_username', 'اسم المستخدم يجب أن يكون من 3 إلى 32 رمزًا إنجليزيًا.', 400)
    if (requestedEmail && (requestedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail))) return apiError('invalid_email', 'البريد الإلكتروني غير صالح.', 400)
    if (password.length < 8 || !/[A-Za-z\p{L}]/u.test(password) || !/\d/.test(password)) return apiError('weak_password', 'استخدم 8 أحرف على الأقل مع رقم.', 400)
    if (password !== passwordConfirm) return apiError('password_mismatch', 'كلمتا المرور غير متطابقتين.', 400)
    email = requestedEmail || `registration-${crypto.randomUUID()}@school-pulse.invalid`
    passwordHash = hashPassword(password)
    const flood = await isRequestFlooded([['account-register-ip', ip], ['account-register-email', requestedEmail], ['account-register-username', username], ['account-register-phone', phone]])
    if (flood.blocked) return apiError('rate_limited', 'تم إيقاف الطلبات مؤقتًا بسبب كثرة المحاولات.', 429)
  }

  const identities: SQL[] = [eq(users.email, email)]
  if (googleSubject) identities.push(eq(users.googleSubject, googleSubject))
  if (username) identities.push(eq(users.username, username))
  if (phone) identities.push(eq(users.phone, phone))
  const [existingUser] = await db.select({ id: users.id }).from(users).where(or(...identities)).limit(1)
  if (existingUser) return apiError('identity_taken', 'بيانات التسجيل مرتبطة بحساب موجود مسبقًا.', 409)

  const pendingIdentity: SQL[] = []
  if (googleSubject) pendingIdentity.push(eq(registrationRequests.googleSubject, googleSubject))
  if (email && !email.endsWith('@school-pulse.invalid')) pendingIdentity.push(eq(registrationRequests.email, email))
  if (username) pendingIdentity.push(eq(registrationRequests.username, username))
  if (phone) pendingIdentity.push(eq(registrationRequests.phone, phone))
  if (pendingIdentity.length) {
    const [duplicate] = await db.select({ id: registrationRequests.id }).from(registrationRequests)
      .where(and(eq(registrationRequests.status, 'pending'), or(...pendingIdentity))).limit(1)
    if (duplicate) return apiError('registration_pending', 'يوجد طلب تسجيل قيد المراجعة بهذه البيانات.', 409)
  }

  const [requestRow] = await db.insert(registrationRequests).values({
    googleSubject,
    email,
    googleName,
    username,
    passwordHash,
    requestedRole: role,
    fullName,
    birthDate,
    phone: phone || null,
    classId: classId || null,
    subjectId: role === 'teacher' ? subjectId : null,
    status: 'pending',
  }).returning({ id: registrationRequests.id })

  await notifyAdmins(role, fullName, phone || null)
  return apiJson({ status: 'pending', requestId: requestRow.id, email: email.endsWith('@school-pulse.invalid') ? null : email, username, requestedRole: role }, 201)
}
