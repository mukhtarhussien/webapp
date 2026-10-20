import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, content) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content.endsWith('\n') ? content : content + '\n', 'utf8')
}
const mustReplace = (source, needle, replacement, label) => {
  if (!source.includes(needle)) throw new Error('Expected anchor not found: ' + label)
  return source.replace(needle, replacement)
}

// Fail before writing anything if this is not the expected legacy project revision.
const preflightSchema = read('db/schema.ts')
const preflightHome = read('app/page.tsx')
const preflightAdmin = read('app/admin/page.tsx')
if (!preflightSchema.includes("export const users = pgTable(\n  'users',") || !preflightSchema.includes("classId: uuid('class_id')")) throw new Error('Unexpected db/schema.ts structure; no files were changed.')
if (!preflightHome.includes('if(!user) return <div className=\"page-stack\">') || !preflightHome.includes('const db=requireDb()')) throw new Error('Unexpected app/page.tsx structure; no files were changed.')
if (!preflightAdmin.includes('      <details className=\"admin-panel\"><summary><Settings2 size={18}/> إعدادات المنصة') || !preflightAdmin.includes('</form><div className=\"admin-form\"><h3>الإعدادات الحالية</h3>')) throw new Error('Unexpected app/admin/page.tsx structure; no files were changed.')

const newFiles = {
  'components/motion-bootstrap.tsx': String.raw`'use client'

import { useEffect } from 'react'

export function MotionBootstrap() {
  useEffect(() => {
    const disabled = window.localStorage.getItem('school-pulse-motion') === 'off'
    document.documentElement.dataset.motion = disabled ? 'off' : 'on'
  }, [])
  return null
}
`,
  'components/motion-toggle.tsx': String.raw`'use client'

import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'

export function MotionToggle({ compact = false }: { compact?: boolean }) {
  const [disabled, setDisabled] = useState(false)
  useEffect(() => {
    setDisabled(window.localStorage.getItem('school-pulse-motion') === 'off')
  }, [])
  const toggle = () => {
    const next = !disabled
    setDisabled(next)
    window.localStorage.setItem('school-pulse-motion', next ? 'off' : 'on')
    document.documentElement.dataset.motion = next ? 'off' : 'on'
  }
  return <button type="button" className={'motion-toggle' + (compact ? ' compact' : '')} onClick={toggle} aria-pressed={disabled}>
    {disabled ? <Play size={16}/> : <Pause size={16}/>}<span>{disabled ? 'تفعيل الرسوم المتحركة' : 'تعطيل الرسوم المتحركة'}</span>
  </button>
}
`,
  'components/reveal.tsx': String.raw`'use client'

import { useEffect, useRef, useState } from 'react'

export function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const motionOff = window.localStorage.getItem('school-pulse-motion') === 'off'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (motionOff || reduced || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} className={'reveal ' + (visible ? 'is-visible ' : '') + className} style={{ '--reveal-delay': delay + 'ms' } as React.CSSProperties}>{children}</div>
}
`,
  'components/login-experience.tsx': String.raw`'use client'

import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { MotionToggle } from '@/components/motion-toggle'

export function LoginExperience({ children, logoUrl, portalNameAr, portalNameEn }: {
  children: React.ReactNode
  logoUrl: string
  portalNameAr: string
  portalNameEn: string
}) {
  const [phase, setPhase] = useState<'checking' | 'welcome' | 'ready'>('checking')

  useEffect(() => {
    const seen = window.localStorage.getItem('school-portal-welcome-seen') === 'yes'
    const motionOff = window.localStorage.getItem('school-pulse-motion') === 'off'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (seen || motionOff || reduced) {
      setPhase('ready')
      return
    }
    setPhase('welcome')
    const timer = window.setTimeout(() => {
      window.localStorage.setItem('school-portal-welcome-seen', 'yes')
      setPhase('ready')
    }, 1350)
    return () => window.clearTimeout(timer)
  }, [])

  return <div className={'login-experience phase-' + phase}>
    {phase === 'welcome' && <div className="welcome-splash" aria-live="polite">
      <div className="welcome-mark">
        {logoUrl ? <img src={logoUrl} alt={portalNameAr} /> : <GraduationCap size={30} strokeWidth={1.6} />}
      </div>
      <p className="welcome-kicker">{portalNameEn}</p>
      <h1>{'أهلًا بك'}</h1>
      <p className="welcome-name">{portalNameAr}</p>
    </div>}
    <div className={'login-stage ' + (phase === 'ready' ? 'is-ready' : '')}>
      <div className="login-motion-control"><MotionToggle /></div>
      {children}
    </div>
  </div>
}
`,
  'components/app-upload-manager.tsx': String.raw`'use client'

import { Download, FileArchive, LoaderCircle, UploadCloud } from 'lucide-react'
import { useState } from 'react'

export function AppUploadManager({ currentName = '', currentVersion = '' }: { currentName?: string; currentVersion?: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [version, setVersion] = useState(currentVersion)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) { setStatus('اختر ملف APK أولًا.'); return }
    if (!file.name.toLowerCase().endsWith('.apk')) { setStatus('المسموح ملف Android بصيغة APK فقط.'); return }
    if (file.size > 200 * 1024 * 1024) { setStatus('حجم الملف يتجاوز 200 ميغابايت.'); return }
    if (!version.trim()) { setStatus('اكتب رقم الإصدار.'); return }
    setBusy(true); setFinished(false); setStatus('جارٍ تجهيز رفع آمن…')
    try {
      const signed = await fetch('/api/admin/app-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, version: version.trim() })
      })
      const signedData = await signed.json()
      if (!signed.ok) throw new Error(signedData.error || 'تعذر تجهيز الرفع.')
      setStatus('جارٍ رفع التطبيق إلى التخزين…')
      const upload = await fetch(signedData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': signedData.contentType }, body: file })
      if (!upload.ok) throw new Error('فشل رفع الملف إلى التخزين. تحقق من إعدادات Object Storage وCORS ثم أعد المحاولة.')
      setStatus('جارٍ حفظ الإصدار…')
      const complete = await fetch('/api/admin/app-upload/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectKey: signedData.objectKey, fileName: file.name, sizeBytes: file.size, version: version.trim() })
      })
      const completeData = await complete.json()
      if (!complete.ok) throw new Error(completeData.error || 'تم الرفع لكن تعذر حفظ بيانات الإصدار.')
      setFinished(true); setStatus('تم نشر الإصدار. زر تنزيل التطبيق أصبح جاهزًا.')
      setFile(null)
      window.location.reload()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'حدث خطأ غير متوقع.')
    } finally { setBusy(false) }
  }

  return <div className="app-release-manager">
    <div className="app-release-current">
      <div className="app-release-symbol"><FileArchive size={21}/></div>
      <div><strong>{currentName || 'إصدار التطبيق الحالي'}</strong><span>{currentVersion ? 'الإصدار ' + currentVersion : 'لم يُنشر تطبيق حتى الآن'}</span></div>
      <a href="/api/app/download" className="admin-small-button" title="اختبار التنزيل"><Download size={15}/></a>
    </div>
    <form className="app-release-form" onSubmit={submit}>
      <label className="admin-field"><span>ملف Android (APK)</span><input type="file" accept=".apk,application/vnd.android.package-archive" onChange={event => setFile(event.target.files?.[0] ?? null)} required /></label>
      <label className="admin-field"><span>رقم الإصدار</span><input value={version} onChange={event => setVersion(event.target.value)} placeholder="مثال: 1.0.3" required /></label>
      {file && <p className="app-release-file"><FileArchive size={15}/>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <UploadCloud size={16}/>} {busy ? 'جارٍ الرفع…' : 'رفع ونشر الإصدار'}</button>
      {status && <p className={'app-release-status' + (finished ? ' success' : '')} role="status">{status}</p>}
    </form>
  </div>
}
`,
  'lib/object-storage.ts': String.raw`import 'server-only'
import { S3Client } from '@aws-sdk/client-s3'

export const APP_STORAGE_BUCKET = 'uploads'
export const APK_CONTENT_TYPE = 'application/vnd.android.package-archive'

export function getObjectStorageClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const region = process.env.AWS_REGION || 'eu-central-1'
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Object Storage is not configured. Set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION.')
  }
  return new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
}
`,
  'app/account/actions.ts': String.raw`'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

const value = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()

export async function saveAccountAction(fd: FormData) {
  const user = await getCurrentUser()
  if (!user || !user.isActive) throw new Error('UNAUTHORIZED')
  const fullNameAr = value(fd, 'fullNameAr')
  const fullNameEn = value(fd, 'fullNameEn')
  const phone = value(fd, 'phone')
  if (fullNameAr.length < 3 || fullNameAr.length > 160) throw new Error('INVALID_NAME')
  if (fullNameEn.length < 2 || fullNameEn.length > 160) throw new Error('INVALID_NAME_EN')
  if (phone.length > 40) throw new Error('INVALID_PHONE')

  await requireDb().update(users).set({
    fullNameAr,
    fullNameEn,
    phone: phone || null,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id))

  revalidatePath('/account')
  revalidatePath('/')
  revalidatePath('/messages')
}
`,
  'app/messages/actions.ts': String.raw`'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

export async function toggleBlockedUserAction(fd: FormData) {
  const user = await getCurrentUser()
  if (!user || !user.isActive) throw new Error('UNAUTHORIZED')
  const targetId = String(fd.get('userId') ?? '').trim()
  const intent = String(fd.get('intent') ?? '')
  if (!targetId || targetId === user.id || (intent !== 'block' && intent !== 'unblock')) throw new Error('INVALID_TARGET')

  const target = await requireDb().select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1)
  if (!target[0]) throw new Error('USER_NOT_FOUND')
  const current = Array.isArray(user.preferences?.blockedUserIds) ? user.preferences.blockedUserIds : []
  const next = intent === 'block'
    ? Array.from(new Set([...current, targetId]))
    : current.filter(id => id !== targetId)
  await requireDb().update(users).set({
    preferences: { ...(user.preferences ?? {}), blockedUserIds: next },
    updatedAt: new Date(),
  }).where(eq(users.id, user.id))
  revalidatePath('/messages')
  revalidatePath('/account')
}
`,
  'app/notifications/actions.ts': String.raw`'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

export async function toggleNotificationsMutedAction() {
  const user = await getCurrentUser()
  if (!user || !user.isActive) throw new Error('UNAUTHORIZED')
  const muted = Boolean(user.preferences?.notificationsMuted)
  await requireDb().update(users).set({
    preferences: { ...(user.preferences ?? {}), notificationsMuted: !muted },
    updatedAt: new Date(),
  }).where(eq(users.id, user.id))
  revalidatePath('/notifications')
  revalidatePath('/')
}
`,
  'app/api/admin/app-upload/route.ts': String.raw`import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getCurrentUser } from '@/lib/auth'
import { APP_STORAGE_BUCKET, APK_CONTENT_TYPE, getObjectStorageClient } from '@/lib/object-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || !user.isActive || user.role !== 'admin') return NextResponse.json({ error: 'هذه العملية متاحة للإدارة فقط.' }, { status: 403 })
  try {
    const body = await request.json()
    const fileName = String(body.fileName ?? '').trim()
    const sizeBytes = Number(body.sizeBytes)
    const version = String(body.version ?? '').trim()
    if (!fileName.toLowerCase().endsWith('.apk')) return NextResponse.json({ error: 'يُسمح بملفات APK فقط.' }, { status: 400 })
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 200 * 1024 * 1024) return NextResponse.json({ error: 'حجم التطبيق يجب أن يكون أقل من 200 ميغابايت.' }, { status: 400 })
    if (!version || version.length > 40) return NextResponse.json({ error: 'رقم الإصدار غير صالح.' }, { status: 400 })
    const objectKey = 'app-releases/' + randomUUID() + '.apk'
    const client = getObjectStorageClient()
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: APP_STORAGE_BUCKET, Key: objectKey, ContentType: APK_CONTENT_TYPE }), { expiresIn: 900 })
    return NextResponse.json({ uploadUrl, objectKey, contentType: APK_CONTENT_TYPE }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر تجهيز رابط الرفع.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
`,
  'app/api/admin/app-upload/complete/route.ts': String.raw`import { NextResponse } from 'next/server'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { siteSettings } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { APP_STORAGE_BUCKET, getObjectStorageClient } from '@/lib/object-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function saveSetting(key: string, value: string) {
  await requireDb().insert(siteSettings).values({ key, value: { value }, updatedAt: new Date() }).onConflictDoUpdate({
    target: siteSettings.key,
    set: { value: { value }, updatedAt: new Date() },
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || !user.isActive || user.role !== 'admin') return NextResponse.json({ error: 'هذه العملية متاحة للإدارة فقط.' }, { status: 403 })
  try {
    const body = await request.json()
    const objectKey = String(body.objectKey ?? '')
    const fileName = String(body.fileName ?? '').replace(/[\r\n"\\/]/g, '_').slice(0, 140)
    const sizeBytes = Number(body.sizeBytes)
    const version = String(body.version ?? '').trim()
    if (!objectKey.startsWith('app-releases/') || !objectKey.endsWith('.apk')) return NextResponse.json({ error: 'مفتاح التخزين غير صالح.' }, { status: 400 })
    if (!fileName.toLowerCase().endsWith('.apk') || !version || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return NextResponse.json({ error: 'بيانات الإصدار غير مكتملة.' }, { status: 400 })
    const client = getObjectStorageClient()
    const head = await client.send(new HeadObjectCommand({ Bucket: APP_STORAGE_BUCKET, Key: objectKey }))
    if (head.ContentLength && head.ContentLength !== sizeBytes) return NextResponse.json({ error: 'حجم الملف المستلم لا يطابق الملف المحدد.' }, { status: 400 })
    await Promise.all([
      saveSetting('mobile_app_object_key', objectKey),
      saveSetting('mobile_app_filename', fileName),
      saveSetting('mobile_app_version', version),
      saveSetting('mobile_app_size_bytes', String(sizeBytes)),
    ])
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر حفظ الإصدار.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
`,
  'app/api/app/download/route.ts': String.raw`import { NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { siteSettings } from '@/db/schema'
import { APP_STORAGE_BUCKET, getObjectStorageClient } from '@/lib/object-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await requireDb().select().from(siteSettings).where(eq(siteSettings.key, 'mobile_app_object_key')).limit(1)
    const objectKey = String((rows[0]?.value as { value?: string } | undefined)?.value ?? '')
    const nameRows = await requireDb().select().from(siteSettings).where(eq(siteSettings.key, 'mobile_app_filename')).limit(1)
    const fileName = String((nameRows[0]?.value as { value?: string } | undefined)?.value ?? 'school-portal.apk').replace(/[\r\n"\\/]/g, '_').slice(0, 140)
    if (!objectKey.startsWith('app-releases/') || !objectKey.endsWith('.apk')) {
      return new NextResponse('لم تنشر إدارة المدرسة تطبيقًا للتنزيل بعد.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    const client = getObjectStorageClient()
    const url = await getSignedUrl(client, new GetObjectCommand({
      Bucket: APP_STORAGE_BUCKET,
      Key: objectKey,
      ResponseContentType: 'application/vnd.android.package-archive',
      ResponseContentDisposition: 'attachment; filename="' + fileName + '"',
    }), { expiresIn: 180 })
    return NextResponse.redirect(url, { status: 302 })
  } catch {
    return new NextResponse('خدمة تنزيل التطبيق غير مهيأة. راجع إعدادات التخزين في Vercel.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
`,
  'app/login/page.tsx': String.raw`import { inArray } from 'drizzle-orm'
import Link from 'next/link'
import { Chrome, ShieldCheck } from 'lucide-react'
import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { loginAction } from './actions'
import { LoginExperience } from '@/components/login-experience'

export const dynamic = 'force-dynamic'

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const message = error === 'missing' ? 'أدخل البريد وكلمة المرور.' : error === 'invalid' ? 'بيانات الدخول غير صحيحة.' : error === 'rate_limited' ? 'تم إيقاف الطلبات مؤقتًا بسبب معدل مرتفع.' : error === 'password_locked' ? 'تم قفل محاولات كلمة المرور لمدة 15 دقيقة بعد محاولات فاشلة متكررة.' : error === 'google_not_configured' ? 'Google Auth غير مهيأ بعد. أضف مفاتيح Google إلى البيئة.' : error === 'google_cancelled' ? 'تم إلغاء تسجيل Google.' : error === 'google_state' ? 'انتهت جلسة Google. ابدأ من جديد.' : error === 'google_profile' ? 'تعذر التحقق من حساب Google.' : error === 'admin_google_blocked' ? 'حساب الإدارة يستخدم البريد وكلمة المرور ثم TOTP.' : error === 'registration_expired' ? 'انتهت جلسة التسجيل. ابدأ من Google من جديد.' : error === 'account_inactive' ? 'هذا الحساب غير مفعّل حاليًا. راجع إدارة المدرسة.' : null
  const settings = db ? await db.select().from(siteSettings).where(inArray(siteSettings.key, ['portal_logo_url', 'portal_name_ar', 'portal_name_en'])).limit(3) : []
  const map = new Map(settings.map(item => [item.key, String((item.value as { value?: string })?.value ?? '')]))
  const logoUrl = map.get('portal_logo_url') || ''
  const portalNameAr = map.get('portal_name_ar') || 'بوابة المدرسة'
  const portalNameEn = map.get('portal_name_en') || 'School Portal'

  return <LoginExperience logoUrl={logoUrl} portalNameAr={portalNameAr} portalNameEn={portalNameEn}>
    <main className="auth-page"><div className="auth-card card login-card">
      <div className="auth-security-icon"><ShieldCheck size={22}/></div>
      <span className="eyebrow">{portalNameEn}</span>
      <h1>الدخول إلى المنصة</h1>
      <p>مكان واحد للدرجات والواجبات والتواصل المدرسي، بواجهة هادئة وواضحة.</p>
      {message && <div className="form-error" role="alert">{message}</div>}
      <Link href="/api/auth/google" className="google-login-button"><Chrome size={18}/>المتابعة باستخدام Google</Link>
      <div className="auth-divider"><span>دخول الإدارة</span></div>
      <form action={loginAction} className="form-stack">
        <label>البريد الإلكتروني<input name="email" type="email" autoComplete="email" required /></label>
        <label>كلمة المرور<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="button button-primary login-submit" type="submit">دخول الإدارة</button>
      </form>
      <p className="registration-login-note">طالب جديد؟ ابدأ من Google، ثم أكمل بيانات التسجيل وانتظر موافقة الإدارة.</p>
      <Link href="/rules" className="auth-secondary login-rules">قراءة قواعد المنصة</Link>
      <Link href="/" className="auth-back">العودة إلى البوابة</Link>
    </div></main>
  </LoginExperience>
}
`,
  'app/account/page.tsx': String.raw`import { and, eq } from 'drizzle-orm'
import { Mail, Phone, ShieldCheck, UserRound, BellOff, Bell, PencilLine } from 'lucide-react'
import { requireDb } from '@/db'
import { attendanceRecords, classes, grades, assessments } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { saveAccountAction } from './actions'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Account() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const db = requireDb()
  const [classRows, gradeRows, attendance] = await Promise.all([
    user.classId ? db.select().from(classes).where(eq(classes.id, user.classId)).limit(1) : Promise.resolve([]),
    db.select({ score: grades.score, max: assessments.maxScore }).from(grades).innerJoin(assessments, eq(assessments.id, grades.assessmentId)).where(and(eq(grades.studentId, user.id), eq(assessments.published, true))),
    db.select({ status: attendanceRecords.status }).from(attendanceRecords).where(eq(attendanceRecords.studentId, user.id)),
  ])
  const avg = gradeRows.length ? gradeRows.reduce((total, row) => total + (row.max ? row.score / row.max * 100 : 0), 0) / gradeRows.length : 0
  const present = attendance.filter(row => row.status === 'present' || row.status === 'late').length
  const attendancePct = attendance.length ? present / attendance.length * 100 : 0
  const muted = Boolean(user.preferences?.notificationsMuted)
  const blockedCount = Array.isArray(user.preferences?.blockedUserIds) ? user.preferences.blockedUserIds.length : 0

  return <div className="account-page page-stack">
    <section className="account-profile-card card">
      <div className="account-head"><div className="account-avatar">{user.fullNameAr.slice(0, 1)}</div><div><span className="eyebrow">حسابي</span><h1>{user.fullNameAr}</h1><p>{user.studentNumber || user.email}{classRows[0] ? ' · ' + classRows[0].nameAr : ''}</p></div><span className="account-status"><span/> {user.isActive ? 'حساب فعال' : 'حساب معطل'}</span></div>
      <div className="account-metrics"><div><span>المعدل العام</span><strong>{avg.toFixed(1)}%</strong></div><div><span>الحضور</span><strong>{attendancePct.toFixed(1)}%</strong></div><div><span>التقييمات المسجلة</span><strong>{gradeRows.length}</strong></div></div>
    </section>

    <section className="account-edit card">
      <div className="section-header"><div><h2><PencilLine size={18}/> تعديل الحساب</h2><p>عدّل معلومات التواصل الظاهرة لبقية حسابات المنصة.</p></div><span className="quiet-icon"><UserRound size={18}/></span></div>
      <form action={saveAccountAction} className="account-form">
        <label className="admin-field"><span>الاسم الكامل بالعربي</span><input name="fullNameAr" defaultValue={user.fullNameAr} autoComplete="name" minLength={3} maxLength={160} required /></label>
        <label className="admin-field"><span>الاسم بالإنكليزي</span><input name="fullNameEn" defaultValue={user.fullNameEn} autoComplete="name" minLength={2} maxLength={160} required /></label>
        <label className="admin-field"><span>رقم الهاتف</span><input name="phone" type="tel" defaultValue={user.phone ?? ''} autoComplete="tel" maxLength={40} /></label>
        <label className="admin-field"><span>البريد الإلكتروني</span><input value={user.email} readOnly aria-readonly="true" /></label>
        <button className="button button-primary" type="submit">حفظ التعديلات</button>
      </form>
    </section>

    <section className="account-settings card">
      <div className="section-header"><div><h2><ShieldCheck size={18}/> تفضيلات الحساب</h2><p>التحكم بإشعاراتك وإدارة الأشخاص المحظورين.</p></div></div>
      <Link href="/notifications" className="account-setting-row"><span className="setting-icon">{muted ? <BellOff size={17}/> : <Bell size={17}/>}</span><span><strong>الإشعارات</strong><small>{muted ? 'الإشعارات مكتومة' : 'الإشعارات مفعّلة'}</small></span><span className="setting-action">إدارة</span></Link>
      <Link href="/messages" className="account-setting-row"><span className="setting-icon"><UserRound size={17}/></span><span><strong>المستخدمون المحظورون</strong><small>{blockedCount} حساب</small></span><span className="setting-action">إدارة</span></Link>
      <div className="account-setting-row"><span className="setting-icon"><Mail size={17}/></span><span><strong>نوع الحساب</strong><small>{user.role === 'admin' ? 'إدارة' : user.role === 'teacher' ? 'مدرس' : 'طالب'}</small></span></div>
    </section>
  </div>
}
`,
  'app/messages/page.tsx': String.raw`import { desc, eq, or, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Ban, MessageCircle, ShieldCheck, UserRound, UserRoundX } from 'lucide-react'
import { requireDb } from '@/db'
import { messageRequests, users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { toggleBlockedUserAction } from './actions'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Messages() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const db = requireDb()
  const sender = alias(users, 'message_sender')
  const recipient = alias(users, 'message_recipient')
  const blockedIds = Array.isArray(user.preferences?.blockedUserIds) ? user.preferences.blockedUserIds : []
  const rows = await db.select({
    id: messageRequests.id,
    senderId: messageRequests.senderId,
    recipientId: messageRequests.recipientId,
    body: messageRequests.body,
    subject: messageRequests.subject,
    status: messageRequests.status,
    createdAt: messageRequests.createdAt,
    senderAr: sender.fullNameAr,
    senderEn: sender.fullNameEn,
    recipientAr: recipient.fullNameAr,
    recipientEn: recipient.fullNameEn,
  }).from(messageRequests)
    .innerJoin(sender, eq(sender.id, messageRequests.senderId))
    .innerJoin(recipient, eq(recipient.id, messageRequests.recipientId))
    .where(or(eq(messageRequests.recipientId, user.id), eq(messageRequests.senderId, user.id)))
    .orderBy(desc(messageRequests.createdAt)).limit(50)
  const blockedUsers = blockedIds.length
    ? await db.select({ id: users.id, name: users.fullNameAr, email: users.email }).from(users).where(inArray(users.id, blockedIds)).orderBy(users.fullNameAr)
    : []
  const visibleRows = rows.filter(row => !blockedIds.includes(row.senderId === user.id ? row.recipientId : row.senderId))

  return <div className="messages-page page-stack">
    <section className="page-card card">
      <div className="page-title-row"><div><span className="eyebrow">DIRECT</span><h1 className="page-title">الرسائل وطلبات التواصل</h1><p className="page-subtitle">تظهر هنا الطلبات المحفوظة فعليًا في قاعدة بيانات المدرسة.</p></div><div className="quiet-icon"><MessageCircle size={21}/></div></div>
      <div className="messages-list">
        {visibleRows.length ? visibleRows.map(row => {
          const targetId = row.senderId === user.id ? row.recipientId : row.senderId
          const targetName = row.senderId === user.id ? row.recipientAr : row.senderAr
          return <article className="message-item" key={row.id}>
            <span className="message-avatar">{targetName.slice(0, 1)}</span>
            <div className="message-copy"><div className="message-heading"><strong>{targetName}</strong><span>{row.senderId === user.id ? 'أرسلته' : 'وصلتك'}</span></div><p>{row.subject || row.body}</p><div className="message-meta"><span>{row.status}</span><time dateTime={row.createdAt.toISOString()}>{row.createdAt.toLocaleString('ar-IQ')}</time></div></div>
            <form action={toggleBlockedUserAction} className="message-block-form"><input type="hidden" name="userId" value={targetId}/><input type="hidden" name="intent" value="block"/><button type="submit" className="quiet-danger" title="حظر هذا المستخدم"><Ban size={16}/><span>حظر</span></button></form>
          </article>
        }) : <div className="empty-state"><MessageCircle size={24}/><h2>لا توجد طلبات مراسلة</h2><p>ستظهر هنا الطلبات المرتبطة بحسابك. المستخدمون الذين تحظرهم لن يظهروا في هذه القائمة.</p></div>}
      </div>
    </section>

    <section className="blocked-panel card">
      <div className="section-header"><div><h2><UserRoundX size={18}/> المستخدمون المحظورون</h2><p>يمكنك إلغاء الحظر في أي وقت.</p></div><span className="count-note">{blockedUsers.length}</span></div>
      {blockedUsers.length ? blockedUsers.map(blocked => <div className="blocked-user-row" key={blocked.id}><span className="message-avatar muted-avatar">{blocked.name.slice(0, 1)}</span><div><strong>{blocked.name}</strong><small>{blocked.email}</small></div><form action={toggleBlockedUserAction}><input type="hidden" name="userId" value={blocked.id}/><input type="hidden" name="intent" value="unblock"/><button className="button-secondary" type="submit"><ShieldCheck size={15}/> إلغاء الحظر</button></form></div>) : <p className="quiet-empty"><UserRound size={18}/> لم تحظر أي مستخدم.</p>}
    </section>
  </div>
}
`,
  'app/notifications/page.tsx': String.raw`import { and, desc, eq, or, sql } from 'drizzle-orm'
import { Bell, BellOff, CalendarDays, Megaphone } from 'lucide-react'
import { requireDb } from '@/db'
import { announcements, notifications } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { Localized } from '@/components/localized'
import { toggleNotificationsMutedAction } from './actions'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Notifications() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const db = requireDb()
  const muted = Boolean(user.preferences?.notificationsMuted)
  const [ann, personal] = await Promise.all([
    db.select({ id: announcements.id, titleAr: announcements.titleAr, titleEn: announcements.titleEn, bodyAr: announcements.bodyAr, bodyEn: announcements.bodyEn, publishedAt: announcements.publishedAt }).from(announcements).where(and(eq(announcements.published, true), or(eq(announcements.audience, 'all'), eq(announcements.audience, 'students'), and(eq(announcements.audience, 'class'), eq(announcements.classId, user.classId ?? '00000000-0000-0000-0000-000000000000'))))).orderBy(desc(announcements.publishedAt)).limit(20),
    db.select({ id: notifications.id, titleAr: notifications.titleAr, titleEn: notifications.titleEn, bodyAr: notifications.bodyAr, bodyEn: notifications.bodyEn, createdAt: notifications.createdAt }).from(notifications).where(or(eq(notifications.userId, user.id), sql.raw('notifications.user_id is null'))).orderBy(desc(notifications.createdAt)).limit(20),
  ])
  const items = [
    ...ann.map(item => ({ id: 'a-' + item.id, titleAr: item.titleAr, titleEn: item.titleEn, bodyAr: item.bodyAr, bodyEn: item.bodyEn, at: item.publishedAt, important: true })),
    ...personal.map(item => ({ id: 'n-' + item.id, titleAr: item.titleAr, titleEn: item.titleEn, bodyAr: item.bodyAr, bodyEn: item.bodyEn, at: item.createdAt, important: false })),
  ].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))

  return <div className="notifications-page page-stack">
    <section className="page-card card">
      <div className="page-title-row"><div><span className="eyebrow">NOTIFICATIONS</span><h1 className="page-title"><Localized ar="الإشعارات والتبليغات" en="Notifications"/></h1><p className="page-subtitle"><Localized ar="إعلانات المدرسة والإشعارات الموجهة لحسابك." en="School announcements and alerts for your account."/></p></div><div className="quiet-icon">{muted ? <BellOff size={21}/> : <Bell size={21}/>}</div></div>
      <div className={'notification-preference ' + (muted ? 'is-muted' : '')}>
        <div className="notification-preference-icon">{muted ? <BellOff size={18}/> : <Bell size={18}/>}</div>
        <div><strong>{muted ? 'الإشعارات مكتومة' : 'الإشعارات مفعّلة'}</strong><p>{muted ? 'تم حفظ اختيارك في حسابك. سجل الإشعارات السابقة يبقى متاحًا.' : 'يمكنك كتم الإشعارات من هنا، وسيبقى سجل التبليغات متاحًا.'}</p></div>
        <form action={toggleNotificationsMutedAction}><button className={muted ? 'button button-primary' : 'button-secondary'} type="submit">{muted ? 'إلغاء الكتم' : 'كتم الإشعارات'}</button></form>
      </div>
      <div className="notifications-list">{items.map(item => <article className="notification-row" key={item.id}><div className="notice-icon">{item.important ? <Megaphone size={17}/> : <CalendarDays size={17}/>}</div><div className="notification-copy"><h3><Localized ar={item.titleAr} en={item.titleEn}/></h3><p><Localized ar={item.bodyAr} en={item.bodyEn}/></p><time>{item.at?.toLocaleString('ar-IQ') ?? ''}</time></div>{item.important && <span className="notification-type">إعلان</span>}</article>)}{items.length === 0 && <p className="quiet-empty">لا توجد تبليغات بعد.</p>}</div>
    </section>
  </div>
}
`,
  'app/redesign.css': String.raw`@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Manrope:wght@500;600;700;800&family=Reem+Kufi:wght@400;500;600;700&display=swap');

:root {
  --bg: #F6F4EF;
  --bg-soft: #EEEAE1;
  --surface: #FFFEFA;
  --surface-soft: #F8F5EE;
  --surface-strong: #F1EEE6;
  --text: #171817;
  --text-soft: #42443F;
  --muted: #716F66;
  --muted-2: #908C82;
  --line: #E5E0D6;
  --line-soft: #ECE8DF;
  --primary: #183A37;
  --primary-2: #285650;
  --accent: #B08D57;
  --accent-soft: #EEE2CD;
  --hero-a: #183A37;
  --hero-b: #234A45;
  --hero-c: #5E6C5A;
  --shadow: 0 8px 28px rgba(34,32,26,.045);
  --shadow-strong: 0 16px 42px rgba(34,32,26,.085);
  --glass: rgba(255,254,250,.92);
}

body { font-family: 'Manrope', 'Amiri', sans-serif; background: var(--bg); color: var(--text); }
.brand strong, .drawer-title strong, .admin-brand strong { font-family: 'Fatimid Kufi', 'Reem Kufi', 'Amiri', serif; }
.side-nav a, .bottom-nav a, .theme-trigger, .theme-option-copy strong, .lang-button, .drawer-links strong, .topbar-title strong { font-family: 'Reem Kufi', 'Manrope', sans-serif; }
.message-item, .message-item p, .community-post, .community-post p, .notification-row, .notification-row p, .notice-copy, .notice-copy p, .page-subtitle, .section-header p { font-family: 'Amiri', serif; }

.sidebar, .topbar, .card, .page-card, .drawer { background: var(--surface); border-color: var(--line); box-shadow: none; }
.sidebar { border-left-color: var(--line); }
.topbar { background: var(--glass); box-shadow: 0 1px 0 var(--line); }
.brand-mark { background: var(--primary) !important; color: #fff !important; box-shadow: none !important; overflow: hidden; }
.brand-logo-image { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
.side-profile { background: var(--surface-soft); border-color: var(--line); }
.profile-avatar { background: var(--accent-soft) !important; color: var(--primary) !important; }
.side-nav a { color: var(--muted); }
.side-nav a:hover, .side-nav a.active { background: #EBE8DF; color: var(--primary); }
.icon-button, .lang-button, .top-action { background: var(--surface); color: var(--text-soft); border-color: var(--line); box-shadow: none; }
.icon-button:hover, .lang-button:hover, .top-action:hover { background: var(--surface-soft); color: var(--primary); }
.content-wrap { padding-top: 29px; }
.page-transition { animation: page-enter .28s ease-out both; }
.hero-card { background: linear-gradient(125deg, var(--hero-a), var(--hero-b) 63%, var(--hero-c)) !important; box-shadow: var(--shadow-strong) !important; }
.hero-glow, .hero-card:after { display: none; }
.hero-content h1 { letter-spacing: -.02em; }
.button-primary { background: var(--primary) !important; color: #fff !important; border: 1px solid var(--primary) !important; }
.button-primary:hover { background: var(--primary-2) !important; }
.button-light { color: var(--primary) !important; background: var(--surface) !important; }
.button-ghost-light { border-color: rgba(255,255,255,.3) !important; background: rgba(255,255,255,.055) !important; }
.section-header a, .setting-row code, .map-location-dot { color: var(--primary) !important; }
.stat-icon.blue, .stat-icon.purple, .stat-icon.orange, .stat-icon.green, .stat-card .stat-icon, .tone-blue .stat-icon, .tone-purple .stat-icon, .tone-orange .stat-icon, .tone-green .stat-icon { background: var(--accent-soft) !important; color: var(--primary) !important; }
.subject-dot.blue, .subject-dot.purple, .subject-dot.orange, .subject-dot.green { background: var(--accent) !important; }
.mini-fill.blue, .mini-fill.purple, .mini-fill.orange, .mini-fill.green { background: var(--primary) !important; }
.notice-icon, .drawer-icon { background: var(--surface-strong) !important; color: var(--primary) !important; }
.event-date.violet, .event-date.teal { background: var(--surface-strong) !important; color: var(--primary) !important; }
.pill.slate { background: var(--surface-strong) !important; color: var(--muted) !important; }
.admin-panel, .admin-form { background: var(--surface); box-shadow: none; border-color: var(--line); }
.admin-field input:focus, .admin-field select:focus, .admin-form textarea:focus, .form-stack input:focus { border-color: var(--primary) !important; box-shadow: 0 0 0 3px rgba(24,58,55,.075) !important; }
.admin-danger { color: #87443B !important; }
.admin-danger:hover { background: #F3E8E5 !important; }

.motion-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 39px; padding: 9px 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 700; transition: background-color .16s ease, border-color .16s ease; }
.motion-toggle:hover { background: var(--surface-soft); border-color: #CBC3B5; }
.motion-toggle.compact { width: 100%; justify-content: flex-start; }
.login-experience { min-height: 100vh; position: relative; }
.login-stage { opacity: 0; transform: translateY(5px); transition: opacity .3s ease, transform .3s ease; }
.login-stage.is-ready { opacity: 1; transform: none; }
.login-motion-control { max-width: 440px; margin: 0 auto; padding: 15px 0 0; display: flex; justify-content: flex-end; }
.login-card { position: relative; }
.login-card .eyebrow { letter-spacing: .04em; color: var(--muted); }
.login-card h1 { font-family: 'Reem Kufi', 'Amiri', serif; font-size: 28px; letter-spacing: -.02em; }
.login-card > p { line-height: 1.9; }
.login-submit { width: 100%; border-radius: 11px; min-height: 43px; }
.login-rules { margin-top: 12px; text-decoration: none; display: flex; justify-content: center; }
.welcome-splash { position: fixed; inset: 0; z-index: 100; background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 25px; animation: welcome-fade-in .28s ease both; }
.welcome-mark { width: 70px; height: 70px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 19px; background: var(--surface); color: var(--primary); overflow: hidden; }
.welcome-mark img { width: 100%; height: 100%; object-fit: contain; padding: 8px; }
.welcome-kicker { margin: 19px 0 0; color: var(--muted); font: 600 10px 'Manrope', sans-serif; letter-spacing: .12em; text-transform: uppercase; }
.welcome-splash h1 { margin: 8px 0 2px; color: var(--primary); font: 600 34px 'Fatimid Kufi', 'Reem Kufi', 'Amiri', serif; }
.welcome-name { margin: 0; color: var(--muted); font: 700 13px 'Reem Kufi', sans-serif; }
.account-page { gap: 15px; }
.account-profile-card, .account-edit, .account-settings, .blocked-panel { padding: 22px; }
.account-head { display: flex; align-items: center; gap: 15px; }
.account-head h1 { margin: 4px 0; font-size: 24px; font-family: 'Reem Kufi', sans-serif; }
.account-head p { margin: 0; color: var(--muted); font-size: 12px; }
.account-avatar { width: 54px; height: 54px; flex: 0 0 54px; display: grid; place-items: center; border-radius: 15px; background: var(--primary); color: #fff; font-size: 22px; }
.account-status { margin-inline-start: auto; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 10px; color: var(--muted); white-space: nowrap; }
.account-status span { display: inline-block; width: 6px; height: 6px; margin-inline-end: 5px; border-radius: 50%; background: var(--primary); }
.account-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-top: 20px; margin-top: 20px; border-top: 1px solid var(--line); }
.account-metrics > div { display: grid; gap: 5px; }
.account-metrics span { color: var(--muted); font-size: 11px; }
.account-metrics strong { font-size: 21px; font-weight: 700; }
.account-edit .section-header h2, .account-settings .section-header h2, .blocked-panel .section-header h2 { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 17px; }
.account-edit .section-header p, .account-settings .section-header p, .blocked-panel .section-header p { margin-top: 5px; }
.quiet-icon { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 42px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); color: var(--primary); }
.account-form { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.account-form .button { justify-self: start; min-width: 145px; }
.account-setting-row { display: flex; align-items: center; gap: 12px; min-height: 62px; padding: 11px 0; border-top: 1px solid var(--line); text-decoration: none; }
.account-setting-row > span:nth-child(2) { display: grid; gap: 4px; flex: 1; }
.account-setting-row strong { font-size: 12px; }
.account-setting-row small { color: var(--muted); font-size: 10px; }
.setting-icon { width: 36px; height: 36px; display: grid; place-items: center; background: var(--surface-strong); color: var(--primary); border-radius: 10px; }
.setting-action { font-size: 11px; color: var(--primary); }
.messages-page, .notifications-page { gap: 14px; }
.messages-page .page-card, .notifications-page .page-card { padding: 22px; }
.messages-list, .notifications-list { margin-top: 17px; border-top: 1px solid var(--line); }
.message-item { display: flex; gap: 13px; align-items: flex-start; padding: 16px 0; border-bottom: 1px solid var(--line); }
.message-avatar { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; border-radius: 12px; background: var(--accent-soft); color: var(--primary); font-size: 16px; }
.message-copy { flex: 1; min-width: 0; }
.message-heading { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.message-heading strong { font-size: 13px; }
.message-heading > span, .message-meta span { border: 1px solid var(--line); border-radius: 6px; padding: 3px 7px; color: var(--muted); font-size: 9px; }
.message-copy > p { margin: 8px 0; font: 16px/1.8 'Amiri', serif; overflow-wrap: anywhere; }
.message-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.message-meta time { color: var(--muted); font-size: 9px; }
.message-block-form { margin: 0; }
.quiet-danger { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); padding: 8px 10px; border-radius: 8px; background: transparent; color: #87443B; cursor: pointer; font-size: 10px; }
.quiet-danger:hover { background: #F3E8E5; }
.blocked-panel .section-header { margin-bottom: 12px; }
.blocked-user-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
.blocked-user-row > div { display: grid; flex: 1; gap: 4px; }
.blocked-user-row strong { font-size: 12px; }
.blocked-user-row small { color: var(--muted); font-size: 10px; }
.muted-avatar { background: var(--surface-strong); color: var(--muted); }
.count-note { min-width: 28px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; text-align: center; font-size: 10px; }
.empty-state { display: grid; justify-items: center; padding: 36px 16px; text-align: center; color: var(--muted); }
.empty-state h2 { margin: 10px 0 3px; color: var(--text); font-size: 15px; }
.empty-state p { max-width: 400px; margin: 0; font: 15px/1.8 'Amiri', serif; }
.quiet-empty { display: flex; align-items: center; gap: 9px; margin: 0; padding: 16px 0; color: var(--muted); font: 16px/1.8 'Amiri', serif; }
.notification-preference { display: flex; align-items: center; gap: 12px; margin-top: 15px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); }
.notification-preference-icon { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; border-radius: 10px; background: var(--accent-soft); color: var(--primary); }
.notification-preference > div:nth-child(2) { flex: 1; }
.notification-preference strong { font-size: 12px; }
.notification-preference p { margin: 4px 0 0; color: var(--muted); font: 14px/1.6 'Amiri', serif; }
.notification-preference form { margin: 0; }
.notification-row { display: flex; align-items: flex-start; gap: 13px; padding: 16px 0; border-bottom: 1px solid var(--line); }
.notification-copy { flex: 1; }
.notification-copy h3 { margin: 0 0 4px; font-size: 14px; font-family: 'Reem Kufi', sans-serif; }
.notification-copy p { margin: 0 0 8px; color: var(--text-soft); font: 16px/1.8 'Amiri', serif; }
.notification-copy time { color: var(--muted); font-size: 9px; }
.notification-type { padding: 4px 7px; border: 1px solid var(--line); border-radius: 6px; color: var(--muted); font-size: 9px; }
.app-release-manager { display: grid; gap: 16px; }
.app-release-current { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.app-release-current > div:nth-child(2) { display: grid; flex: 1; gap: 4px; }
.app-release-current strong { font-size: 12px; }
.app-release-current span { color: var(--muted); font-size: 10px; }
.app-release-symbol { display: grid; place-items: center; width: 42px; height: 42px; background: var(--accent-soft); color: var(--primary); border-radius: 11px; }
.app-release-form { display: grid; gap: 13px; }
.app-release-file { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--muted); font-size: 11px; }
.app-release-status { margin: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-soft); color: var(--text-soft); font-size: 11px; line-height: 1.7; }
.app-release-status.success { border-color: #BFCFC7; background: #EEF4EE; color: #245346; }
.app-release-form button { justify-self: start; }
.spin { animation: spin .9s linear infinite; }
.reveal { opacity: 0; transform: translateY(12px); transition: opacity .34s ease var(--reveal-delay), transform .34s ease var(--reveal-delay); }
.reveal.is-visible { opacity: 1; transform: none; }
[data-motion="off"] *, [data-motion="off"] *::before, [data-motion="off"] *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
@keyframes page-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes welcome-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }

html[data-theme="dark"] {
  --bg: #171815; --bg-soft: #1D1F1B; --surface: #20221E; --surface-soft: #252722; --surface-strong: #292B25;
  --text: #F1EFE7; --text-soft: #D8D6CD; --muted: #ADA99E; --muted-2: #898579; --line: #383A32; --line-soft: #30322B;
  --primary: #8DB3AA; --primary-2: #A3C4BC; --accent: #C6A36A; --accent-soft: #3A3326;
  --hero-a: #183632; --hero-b: #244640; --hero-c: #454F43; --glass: rgba(32,34,30,.92);
}
html[data-theme="amoled"] {
  --bg: #000; --bg-soft: #050505; --surface: #000; --surface-soft: #090A08; --surface-strong: #11120F;
  --text: #F4F3EE; --text-soft: #DFDDD5; --muted: #96938A; --muted-2: #6F6D66; --line: #242521; --line-soft: #171815;
  --primary: #A3C4BC; --primary-2: #BCD5CF; --accent: #D0AA6A; --accent-soft: #302A20;
  --hero-a: #0C2522; --hero-b: #12332F; --hero-c: #314039; --glass: rgba(0,0,0,.92);
}
html[data-theme="dark"] .side-nav a:hover, html[data-theme="dark"] .side-nav a.active, html[data-theme="amoled"] .side-nav a:hover, html[data-theme="amoled"] .side-nav a.active { background: rgba(141,179,170,.12); color: var(--primary); }
html[data-theme="dark"] .admin-form, html[data-theme="dark"] .admin-panel, html[data-theme="amoled"] .admin-form, html[data-theme="amoled"] .admin-panel { background: var(--surface); color: var(--text); border-color: var(--line); }
html[data-theme="dark"] .form-stack input, html[data-theme="dark"] .form-stack select, html[data-theme="dark"] .form-stack textarea, html[data-theme="amoled"] .form-stack input, html[data-theme="amoled"] .form-stack select, html[data-theme="amoled"] .form-stack textarea { background: var(--surface-soft); color: var(--text); border-color: var(--line); }
html[data-theme="dark"] .notification-preference, html[data-theme="amoled"] .notification-preference { background: var(--surface-soft); }
html[data-theme="dark"] .account-status, html[data-theme="amoled"] .account-status { color: var(--muted); }
html[data-theme="amoled"] .hero-card { box-shadow: 0 20px 52px rgba(0,0,0,.58) !important; }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; } }
@media (max-width: 800px) {
  .login-motion-control { padding: 12px 14px 0; }
  .login-motion-control .motion-toggle { font-size: 10px; }
  .account-profile-card, .account-edit, .account-settings, .blocked-panel, .messages-page .page-card, .notifications-page .page-card { padding: 16px; }
  .account-head { align-items: flex-start; flex-wrap: wrap; }
  .account-status { margin-inline-start: 0; }
  .account-metrics { gap: 6px; }
  .account-metrics strong { font-size: 17px; }
  .account-metrics span { font-size: 9px; }
  .account-form { grid-template-columns: 1fr; }
  .account-form .button { width: 100%; }
  .message-item { flex-wrap: wrap; }
  .message-block-form { margin-inline-start: 55px; }
  .notification-preference { align-items: flex-start; flex-wrap: wrap; }
  .notification-preference form { width: 100%; }
  .notification-preference form button { width: 100%; }
  .app-release-form button { width: 100%; }
}
`
}

for (const [file, content] of Object.entries(newFiles)) write(file, content)

// Keep the existing data model and add per-account preferences without replacing school data.
let schema = read('db/schema.ts')
if (!schema.includes('export type UserPreferences')) {
  schema = mustReplace(schema, "export const users = pgTable(\n  'users',", "export type UserPreferences = {\n  notificationsMuted?: boolean\n  blockedUserIds?: string[]\n}\n\nexport const users = pgTable(\n  'users',", 'users table declaration')
  const usersStart = schema.indexOf("export const users = pgTable(\n  'users',")
  const teachersStart = schema.indexOf('export const teachers', usersStart)
  if (usersStart < 0 || teachersStart < 0) throw new Error('Could not isolate users schema.')
  let usersPart = schema.slice(usersStart, teachersStart)
  const anchor = /\n    classId: uuid\('class_id'\)\.references\([\s\S]*?\n    \),\n\n    \.\.\.timestamps,/
  if (!anchor.test(usersPart)) throw new Error('Could not find users.classId anchor.')
  usersPart = usersPart.replace(anchor, (match) => match.replace('\n\n    ...timestamps,', "\n\n    preferences: jsonb('preferences')\n      .$type<UserPreferences>()\n      .default(sql`'{}'::jsonb`)\n      .notNull(),\n\n    ...timestamps,"))
  schema = schema.slice(0, usersStart) + usersPart + schema.slice(teachersStart)
  write('db/schema.ts', schema)
}

// Replace the shell intentionally: preserve the existing routes and roles, but simplify the presentation.
write('components/app-shell.tsx', String.raw`'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Bell, BellOff, CalendarDays, Check, ChevronDown, Download, FileText, GraduationCap, Home, Languages, Map, Menu, MessageCircle, Moon, Palette, Settings2, ShieldCheck, Sun, UserRound, Users, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LanguageProvider, useLanguage } from './language'
import { MotionToggle } from '@/components/motion-toggle'
import type { User } from '@/db/schema'

type Theme = 'light' | 'dark' | 'amoled'
type ThemeOption = { id: Theme; ar: string; en: string; descriptionAr: string; descriptionEn: string; icon: LucideIcon }
const themes: ThemeOption[] = [
  { id: 'light', ar: 'فاتح', en: 'Light', descriptionAr: 'هادئ وواضح', descriptionEn: 'Calm and clear', icon: Sun },
  { id: 'dark', ar: 'داكن', en: 'Dark', descriptionAr: 'داكن مريح للعين', descriptionEn: 'Comfortable dark palette', icon: Moon },
  { id: 'amoled', ar: 'داكن (موصى به لشاشات AMOLED / OLED)', en: 'Dark (recommended for AMOLED / OLED screens)', descriptionAr: 'أسود حقيقي', descriptionEn: 'True black', icon: Palette },
]
const nav = [
  { href: '/', label: 'الرئيسية', en: 'Home', icon: Home },
  { href: '/grades', label: 'الدرجات', en: 'Grades', icon: BarChart3 },
  { href: '/notifications', label: 'الإشعارات', en: 'Notifications', icon: Bell },
  { href: '/calendar', label: 'التقويم', en: 'Calendar', icon: CalendarDays },
  { href: '/community', label: 'المجتمع', en: 'Community', icon: Users },
]

type ShellProps = { children: React.ReactNode; currentUser: User | null; portalLogoUrl?: string; portalNameAr?: string; portalNameEn?: string }
export function AppShell(props: ShellProps) {
  return <LanguageProvider><ShellInner {...props} /></LanguageProvider>
}

function ShellInner({ children, currentUser, portalLogoUrl = '', portalNameAr = 'مدرستي', portalNameEn = 'School Portal' }: ShellProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('light')
  const [themeReady, setThemeReady] = useState(false)
  const [themeAnimating, setThemeAnimating] = useState(false)
  const { isEn, toggle } = useLanguage()
  const notificationsMuted = Boolean(currentUser?.preferences?.notificationsMuted)

  useEffect(() => {
    const saved = window.localStorage.getItem('school-pulse-theme')
    if (saved === 'light' || saved === 'dark' || saved === 'amoled') setTheme(saved)
    setThemeReady(true)
  }, [])
  useEffect(() => {
    if (!themeReady) return
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark'
    window.localStorage.setItem('school-pulse-theme', theme)
  }, [theme, themeReady])
  if (pathname.startsWith('/admin') || pathname.startsWith('/login')) return <>{children}</>

  const selectTheme = (next: Theme) => {
    if (next === theme) { setThemeOpen(false); return }
    setThemeAnimating(true); setTheme(next); setThemeOpen(false)
  }
  const currentTheme = themes.find(item => item.id === theme) ?? themes[0]
  const ThemeIcon = currentTheme.icon
  return <div className="app-root" dir={isEn ? 'ltr' : 'rtl'}>
    <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
      <div className="brand"><div className="brand-mark">{portalLogoUrl ? <img className="brand-logo-image" src={portalLogoUrl} alt=""/> : <GraduationCap size={20}/>}</div><div><strong>{portalNameAr}</strong><span>{portalNameEn}</span></div></div>
      <div className="side-profile"><div className="profile-avatar">{currentUser?.fullNameAr?.slice(0, 1) ?? '?'}</div><div><strong>{currentUser ? (isEn ? currentUser.fullNameEn : currentUser.fullNameAr) : (isEn ? 'Guest' : 'زائر')}</strong><span>{currentUser ? (currentUser.role === 'teacher' ? (isEn ? 'Teacher' : 'مدرس') : currentUser.role === 'admin' ? (isEn ? 'Administrator' : 'مدير النظام') : (isEn ? 'Student' : 'طالب')) : (isEn ? 'Sign in to view your data' : 'سجّل الدخول لعرض بياناتك')}</span></div><ChevronDown size={16}/></div>
      <nav className="side-nav">{nav.map(({ href, label, en, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} onClick={() => setMenuOpen(false)}><Icon size={18}/><span>{isEn ? en : label}</span></Link>)}<div className="nav-divider"/><Link href="/map" className={pathname === '/map' ? 'active' : ''} onClick={() => setMenuOpen(false)}><Map size={18}/><span>{isEn ? 'Campus map' : 'الخريطة'}</span></Link><Link href="/messages" className={pathname === '/messages' ? 'active' : ''} onClick={() => setMenuOpen(false)}><MessageCircle size={18}/><span>{isEn ? 'Messages' : 'الرسائل'}</span></Link><Link href="/uploads" className={pathname === '/uploads' ? 'active' : ''} onClick={() => setMenuOpen(false)}><FileText size={18}/><span>{isEn ? 'My files' : 'ملفاتي'}</span></Link><Link href="/account" className={pathname === '/account' ? 'active' : ''} onClick={() => setMenuOpen(false)}><UserRound size={18}/><span>{isEn ? 'My account' : 'حسابي'}</span></Link></nav>
      <div className="sidebar-footer"><div className="secure-line"><ShieldCheck size={15}/>{isEn ? 'School portal' : 'بوابة المدرسة'}</div><span>v2.2</span></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label={isEn ? 'Close menu' : 'إغلاق القائمة'}/>}
    <main className="main-shell">
      <header className="topbar"><button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label={isEn ? 'Open menu' : 'فتح القائمة'}><Menu size={20}/></button><div className="topbar-title"><span>{portalNameEn}</span><strong>{currentUser ? (isEn ? 'Connected to your account' : 'متصل بحسابك') : (isEn ? 'Guest view' : 'وضع الزائر')}</strong></div><div className="top-actions">
        <div className="theme-control"><button className={'theme-trigger theme-trigger-' + theme} onClick={() => setThemeOpen(v => !v)} aria-haspopup="menu" aria-expanded={themeOpen} title={isEn ? 'Theme' : 'المظهر'}><ThemeIcon size={17}/><span className="theme-trigger-text">{isEn ? currentTheme.en : currentTheme.ar}</span><ChevronDown size={14} className={'theme-chevron' + (themeOpen ? ' open' : '')}/></button>{themeOpen && <div className="theme-menu" role="menu"><div className="theme-menu-heading">{isEn ? 'Appearance' : 'المظهر'}<span>{isEn ? 'Choose the portal theme' : 'اختَر شكل المنصة'}</span></div>{themes.map(option => { const Icon = option.icon; const active = option.id === theme; return <button key={option.id} className={'theme-option' + (active ? ' active' : '')} onClick={() => selectTheme(option.id)} role="menuitemradio" aria-checked={active}><span className={'theme-option-icon theme-option-' + option.id}><Icon size={17}/></span><span className="theme-option-copy"><strong>{isEn ? option.en : option.ar}</strong><small>{isEn ? option.descriptionEn : option.descriptionAr}</small></span>{active && <Check size={16} className="theme-check"/>}</button>})}</div>}</div>
        <button className="lang-button" onClick={toggle}><Languages size={17}/><span>{isEn ? 'العربية' : 'EN'}</span></button>
        <Link className="top-action" href="/api/app/download" aria-label={isEn ? 'Download app' : 'تنزيل التطبيق'} title={isEn ? 'Download the app' : 'تنزيل التطبيق'}><Download size={18}/></Link>
        <Link className="top-action" href="/messages" aria-label={isEn ? 'Messages' : 'الرسائل'}><MessageCircle size={19}/></Link>
        <Link className={'top-action' + (notificationsMuted ? ' is-muted' : '')} href="/notifications" aria-label={isEn ? 'Notifications' : 'الإشعارات'} title={notificationsMuted ? 'الإشعارات مكتومة' : undefined}>{notificationsMuted ? <BellOff size={19}/> : <Bell size={19}/>}</Link>
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label={isEn ? 'More' : 'المزيد'}><Menu size={20}/></button>
      </div></header>
      <div className="content-wrap"><div key={pathname} className="page-transition">{children}</div></div>
      <nav className="bottom-nav">{nav.slice(0, 4).map(({ href, label, en, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''}><Icon size={18}/><span>{isEn ? en : label}</span></Link>)}</nav>
    </main>
    {menuOpen && <div className="drawer"><div className="drawer-head"><div className="drawer-title"><div className="brand-mark">{portalLogoUrl ? <img className="brand-logo-image" src={portalLogoUrl} alt=""/> : <GraduationCap size={18}/>}</div><div><strong>{isEn ? 'More' : 'المزيد'}</strong><span>{isEn ? 'Useful portal links' : 'روابط وخيارات إضافية'}</span></div></div><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label={isEn ? 'Close' : 'إغلاق'}><X size={19}/></button></div><div className="drawer-links">
      <Link href="/messages" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><MessageCircle size={18}/></div><div><strong>{isEn ? 'Message requests' : 'طلبات المراسلة'}</strong><span>{isEn ? 'Contacts and message requests' : 'طلبات التواصل المدرسي'}</span></div></Link>
      <Link href="/uploads" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><FileText size={18}/></div><div><strong>{isEn ? 'Uploaded files' : 'الملفات التي رفعتها'}</strong><span>{isEn ? 'Your saved files' : 'ملفاتك المحفوظة'}</span></div></Link>
      <Link href="/progress" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><BarChart3 size={18}/></div><div><strong>{isEn ? 'My progress' : 'تقدّمي'}</strong><span>{isEn ? 'Your academic summary' : 'ملخص تقدمك الدراسي'}</span></div></Link>
      <Link href="/rules" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><ShieldCheck size={18}/></div><div><strong>{isEn ? 'School rules' : 'قواعد المنصة'}</strong><span>{isEn ? 'Policies and conduct' : 'السياسات والسلوك'}</span></div></Link>
      <Link href="/account" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><Settings2 size={18}/></div><div><strong>{isEn ? 'Account settings' : 'إعدادات الحساب'}</strong><span>{isEn ? 'Edit your account and preferences' : 'تعديل الحساب والتفضيلات'}</span></div></Link>
      <Link href="/api/app/download" className="drawer-download" onClick={() => setMenuOpen(false)}><div className="drawer-icon accent"><Download size={18}/></div><div><strong>{isEn ? 'Download the app' : 'تنزيل التطبيق'}</strong><span>{isEn ? 'Official Android release' : 'نسخة أندرويد الرسمية'}</span></div><Download size={17}/></Link>
      <div className="drawer-motion"><MotionToggle compact/></div>
    </div></div>}
    {themeAnimating && <div className={'theme-transition theme-transition-' + theme} onAnimationEnd={() => setThemeAnimating(false)} aria-hidden="true"/>}
  </div>
}
`)

// Root layout loads the existing database-backed branding and leaves auth/data logic intact.
write('app/layout.tsx', String.raw`import type { Metadata } from 'next'
import './globals.css'
import './redesign.css'
import { AppShell } from '@/components/app-shell'
import { MotionBootstrap } from '@/components/motion-bootstrap'
import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'مدرستي | School Portal',
  description: 'بوابة مدرسية ثنائية اللغة للدرجات والواجبات والتواصل.',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser()
  const rows = db ? await db.select().from(siteSettings).limit(50) : []
  const settings = new Map(rows.map(row => [row.key, String((row.value as { value?: string })?.value ?? '')]))
  return <html lang="ar" dir="rtl"><body><MotionBootstrap/><AppShell currentUser={user} portalLogoUrl={settings.get('portal_logo_url') || ''} portalNameAr={settings.get('portal_name_ar') || 'مدرستي'} portalNameEn={settings.get('portal_name_en') || 'School Portal'}>{children}</AppShell></body></html>
}
`)

// Add reveal-once wrappers to the homepage sections so below-the-fold content animates only when reached.
let home = read('app/page.tsx')
if (!home.includes("from 'next/navigation'")) home = "import { redirect } from 'next/navigation'\n" + home
if (!home.includes("from '@/components/reveal'")) home = "import { Reveal } from '@/components/reveal'\n" + home
if (home.includes('if(!user) return <div className="page-stack">')) {
  home = home.replace(/\n  if\(!user\) return <div className="page-stack">[\s\S]*?(?=\n  const db=requireDb\(\))/m, "\n  if (!user) redirect('/login')\n")
}
if (!home.includes('<Reveal delay=')) {
  const token = /<\/?section\b[^>]*>/g
  const matches = [...home.matchAll(token)]
  const insertions = []
  const stack = []
  let topIndex = 0
  for (const match of matches) {
    const tag = match[0]
    const index = match.index ?? 0
    if (tag.startsWith('</')) {
      if (!stack.length) continue
      const open = stack.pop()
      if (stack.length === 0) insertions.push({ at: index + tag.length, value: '</Reveal>' })
    } else if (!tag.endsWith('/>')) {
      if (stack.length === 0) {
        insertions.push({ at: index, value: '<Reveal delay={' + (topIndex * 45) + '}>' })
        topIndex += 1
      }
      stack.push(index)
    }
  }
  const grouped = new Map()
  for (const item of insertions) grouped.set(item.at, (grouped.get(item.at) || '') + item.value)
  for (const [at, value] of [...grouped.entries()].sort((a, b) => b[0] - a[0])) home = home.slice(0, at) + value + home.slice(at)
  write('app/page.tsx', home)
}

// Add the APK manager and an explicit branding setting to the existing admin dashboard.
let admin = read('app/admin/page.tsx')
if (!admin.includes("from '@/components/app-upload-manager'")) admin = mustReplace(admin, "import { requireDb } from '@/db'", "import { requireDb } from '@/db'\nimport { AppUploadManager } from '@/components/app-upload-manager'", 'admin manager import')
if (!admin.includes('<AppUploadManager')) {
  const panelAnchor = '      <details className="admin-panel"><summary><Settings2 size={18}/> إعدادات المنصة'
  const releasePanel = '      <details className="admin-panel"><summary><FileText size={18}/> تطبيق المنصة</summary><div className="admin-panel-body"><p className="admin-help">ارفع إصدار APK من هنا. بعد حفظه، زر تنزيل التطبيق يوجّه المستخدمين إلى الإصدار المنشور.</p><AppUploadManager currentName={String((settingsRows.find(s => s.key === \'mobile_app_filename\')?.value as any)?.value ?? \'\')} currentVersion={String((settingsRows.find(s => s.key === \'mobile_app_version\')?.value as any)?.value ?? \'\')} /></div></details>\n\n'
  admin = mustReplace(admin, panelAnchor, releasePanel + panelAnchor, 'app release settings panel')
}
const logoAnchor = "</form><div className=\"admin-form\"><h3>الإعدادات الحالية</h3>"
if (!admin.includes('value="portal_logo_url"')) {
  const logoForm = "</form><form action={updateSettingAction} className=\"admin-form\"><h3>شعار المنصة</h3><p className=\"admin-help\">ألصق رابط HTTPS لصورة الشعار. المفتاح المستخدم هو <code>portal_logo_url</code>.</p><input type=\"hidden\" name=\"key\" value=\"portal_logo_url\"/><label className=\"admin-field\"><span>رابط الشعار</span><input name=\"value\" type=\"url\" defaultValue={String((settingsRows.find(s => s.key === 'portal_logo_url')?.value as any)?.value ?? '')} placeholder=\"https://…\" required/></label><ActionButton>حفظ الشعار</ActionButton></form><div className=\"admin-form\"><h3>الإعدادات الحالية</h3>"
  admin = mustReplace(admin, logoAnchor, logoForm, 'portal logo settings form')
}
write('app/admin/page.tsx', admin)

// Install the S3-compatible SDK without changing the existing database/ORM stack.
const packageJson = JSON.parse(read('package.json'))
packageJson.dependencies = packageJson.dependencies || {}
packageJson.dependencies['@aws-sdk/client-s3'] = packageJson.dependencies['@aws-sdk/client-s3'] || '^3.0.0'
packageJson.dependencies['@aws-sdk/s3-request-presigner'] = packageJson.dependencies['@aws-sdk/s3-request-presigner'] || '^3.0.0'
write('package.json', JSON.stringify(packageJson, null, 2))

// Provide harmless environment placeholders only; never write live credentials into source.
const envExamplePath = '.env.example'
let envExample = fs.existsSync(path.join(root, envExamplePath)) ? read(envExamplePath) : ''
for (const [key, value] of [['AWS_ACCESS_KEY_ID', ''], ['AWS_SECRET_ACCESS_KEY', ''], ['AWS_ENDPOINT_URL_S3', ''], ['AWS_REGION', 'eu-central-1']]) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp('^' + escaped + '=', 'm').test(envExample)) envExample += (envExample && !envExample.endsWith('\n') ? '\n' : '') + key + '=' + value + '\n'
}
write(envExamplePath, envExample)

write('migrations/20261009_user_preferences.sql', String.raw`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
`)

console.log('School Portal redesign files installed. No existing records were deleted.')
console.log('Next: install dependencies, apply the SQL migration, configure Object Storage env vars, then run the production build.')
