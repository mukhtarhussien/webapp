import { and, eq } from 'drizzle-orm'
import { Mail, Phone, ShieldCheck, UserRound, BellOff, Bell, PencilLine } from 'lucide-react'
import { requireDb } from '@/db'
import { attendanceRecords, classes, grades, assessments } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { saveAccountAction } from './actions'
import { ProfilePhotoSettings } from '@/components/profile-photo-settings'
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
  const contactEmail = user.email.endsWith('@school-pulse.invalid') ? '' : user.email
  const loginName = user.username ? `@${user.username}` : user.phone || contactEmail

  return <div className="account-page page-stack">
    <section className="account-profile-card card">
      <div className="account-head"><div className="account-avatar">{user.preferences?.profilePhotoKey ? <img src={`/api/profile-photo/${user.id}?v=${encodeURIComponent(user.preferences.profilePhotoKey)}`} alt={user.fullNameAr} /> : user.fullNameAr.slice(0, 1)}</div><div><span className="eyebrow">حسابي</span><h1>{user.fullNameAr}</h1><p>{user.studentNumber || loginName || 'حساب المدرسة'}{classRows[0] ? ' · ' + classRows[0].nameAr : ''}</p></div><span className="account-status"><span/> {user.isActive ? 'حساب فعال' : 'حساب معطل'}</span></div>
      <div className="account-metrics"><div><span>المعدل العام</span><strong>{avg.toFixed(1)}%</strong></div><div><span>الحضور</span><strong>{attendancePct.toFixed(1)}%</strong></div><div><span>التقييمات المسجلة</span><strong>{gradeRows.length}</strong></div></div>
    </section>

    <section className="account-photo-card card">
      <ProfilePhotoSettings userId={user.id} fullName={user.fullNameAr} profilePhotoKey={user.preferences?.profilePhotoKey} />
    </section>

    <section className="account-edit card">
      <div className="section-header"><div><h2><PencilLine size={18}/> تعديل الحساب</h2><p>عدّل معلومات التواصل الظاهرة لبقية حسابات المنصة.</p></div><span className="quiet-icon"><UserRound size={18}/></span></div>
      <form action={saveAccountAction} className="account-form">
        <label className="admin-field"><span>الاسم الكامل بالعربي</span><input name="fullNameAr" defaultValue={user.fullNameAr} autoComplete="name" minLength={3} maxLength={160} required /></label>
        <label className="admin-field"><span>الاسم بالإنكليزي</span><input name="fullNameEn" defaultValue={user.fullNameEn} autoComplete="name" minLength={2} maxLength={160} required /></label>
        <label className="admin-field"><span>رقم الهاتف</span><input name="phone" type="tel" defaultValue={user.phone ?? ''} autoComplete="tel" maxLength={40} /></label>
        {user.username && <label className="admin-field"><span>اسم المستخدم لتسجيل الدخول</span><input value={`@${user.username}`} readOnly aria-readonly="true" dir="ltr" /></label>}
        <label className="admin-field"><span>البريد الإلكتروني</span><input value={contactEmail || 'لا يوجد بريد إلكتروني مرتبط'} readOnly aria-readonly="true" /></label>
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
