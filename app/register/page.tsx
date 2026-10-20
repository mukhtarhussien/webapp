import Link from 'next/link'
import { Clock3, GraduationCap, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { requireDb } from '@/db'
import { classes, subjects } from '@/db/schema'
import { getRegistrationContext } from '@/lib/google'
import { submitRegistrationAction, submitPasswordRegistrationAction } from './actions'

export const dynamic = 'force-dynamic'

function errorMessage(error: string | undefined) {
  const messages: Record<string, string> = {
    rate_limited: 'تم إيقاف الطلبات مؤقتًا بسبب عدد كبير من المحاولات. جرّب لاحقًا.',
    name: 'اكتب الاسم الثلاثي أو أكثر، باستخدام الحروف فقط.',
    birth_date: 'تاريخ الميلاد غير صالح.',
    phone: 'رقم الهاتف العراقي غير صالح.',
    phone_taken: 'رقم الهاتف مرتبط بحساب موجود مسبقًا.',
    phone_pending: 'هناك طلب تسجيل قيد المراجعة بهذا الرقم.',
    email: 'البريد الإلكتروني غير صالح.',
    email_required: 'البريد الإلكتروني مطلوب لحساب الإدارة.',
    email_taken: 'البريد الإلكتروني مرتبط بطلب أو حساب موجود.',
    username: 'اسم المستخدم من 3 إلى 32 حرفًا أو رقمًا، ويمكن استخدام النقطة والشرطة.',
    username_taken: 'اسم المستخدم مرتبط بطلب أو حساب موجود.',
    identifier: 'أدخل رقم الهاتف أو اسم المستخدم أو البريد الإلكتروني.',
    password: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرفًا ورقمًا.',
    password_mismatch: 'تأكيد كلمة المرور غير مطابق.',
    class: 'الصف المحدد غير موجود.',
    subject: 'اختر المادة التي تدرّسها.',
    subject_missing: 'المادة المحددة غير موجودة.',
    registration_expired: 'انتهت جلسة التسجيل. ابدأ من جديد.',
  }
  return error ? messages[error] ?? 'تعذر إرسال الطلب.' : null
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string; method?: string; role?: string }>
}) {
  const query = await searchParams
  const request = await getRegistrationContext()
  const database = requireDb()
  const [classesRows, subjectsRows] = await Promise.all([
    database.select({ id: classes.id, nameAr: classes.nameAr, gradeLevel: classes.gradeLevel, section: classes.section }).from(classes).orderBy(classes.gradeLevel, classes.nameAr),
    database.select({ id: subjects.id, nameAr: subjects.nameAr, code: subjects.code }).from(subjects).orderBy(subjects.nameAr),
  ])
  const error = errorMessage(query.error)

  if (query.method === 'password') {
    const role = query.role === 'teacher' || query.role === 'admin' ? query.role : 'student'
    const roleName = role === 'teacher' ? 'مدرس' : role === 'admin' ? 'إدارة' : 'طالب'
    if (query.submitted === '1') {
      return <main className="auth-page"><div className="auth-card card registration-card">
        <div className="auth-security-icon"><Clock3 size={22} /></div>
        <span className="eyebrow">REQUEST RECEIVED</span>
        <h1>تم استلام طلبك</h1>
        <p role="status">أرسلنا طلب إنشاء حساب {roleName} إلى إدارة المدرسة. سيُفعّل الحساب وتتمكن من الدخول بعد موافقة الإدارة.</p>
        <Link href="/login" className="button button-primary">العودة لتسجيل الدخول</Link>
      </div></main>
    }

    return <main className="auth-page"><div className="auth-card card registration-card">
      <div className="auth-security-icon"><UserPlus size={22} /></div>
      <span className="eyebrow">{role === 'teacher' ? 'TEACHER' : role === 'admin' ? 'ADMINISTRATION' : 'STUDENT'} REGISTRATION</span>
      <h1>إنشاء حساب {roleName}</h1>
      <p>{role === 'admin' ? 'أرسل طلب حساب الإدارة للمراجعة. بعد الموافقة، سجّل عبر Google بنفس البريد ثم استخدم كلمة المرور وأكمل إعداد رمز التحقق.' : `أدخل بيانات ${roleName}. لن يُفعّل الحساب إلا بعد موافقة إدارة المدرسة.`}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form action={submitPasswordRegistrationAction} className="form-stack">
        <input type="hidden" name="requestedRole" value={role} />
        <label>الاسم الثلاثي<input name="fullName" autoComplete="name" required /></label>
        <label>تاريخ الميلاد<input name="birthDate" type="date" required /></label>
        {role === 'student' && <label>الصف<select name="classId" required defaultValue=""><option value="">اختر الصف</option>{classesRows.map((item) => <option key={item.id} value={item.id}>{item.nameAr} · المرحلة {item.gradeLevel}{item.section ? ` · ${item.section}` : ''}</option>)}</select></label>}
        {role === 'teacher' && <label>الاختصاص / المادة<select name="subjectId" required defaultValue=""><option value="">اختر المادة</option>{subjectsRows.map((item) => <option key={item.id} value={item.id}>{item.nameAr} · {item.code}</option>)}</select></label>}
        <div className="registration-identifier-heading"><strong>بيانات الدخول</strong><span>{role === 'admin' ? 'استخدم بريد Google نفسه عند الدخول بعد الموافقة' : 'يكفي إدخال واحد منها على الأقل'}</span></div>
        {role !== 'admin' && <label>اسم المستخدم (اختياري)<input name="username" autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]{3,32}" dir="ltr" placeholder="student_name" /></label>}
        <label>البريد الإلكتروني {role === 'admin' ? '' : '(اختياري)'}<input name="email" type="email" autoComplete="email" dir="ltr" placeholder="name@example.com" required={role === 'admin'} /></label>
        <label>رقم الهاتف {role === 'teacher' ? '' : '(اختياري)'}<input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="07xxxxxxxxx" required={role === 'teacher'} /></label>
        <label>كلمة المرور<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label>تأكيد كلمة المرور<input name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required /></label>
        <button className="button button-primary" type="submit"><UserPlus size={16} /> {role === 'teacher' ? 'إرسال طلب إنشاء حساب مدرس' : role === 'admin' ? 'إرسال طلب حساب الإدارة للموافقة' : 'إرسال طلب إنشاء حساب طالب'}</button>
      </form>
      <p className="registration-note">{role === 'admin' ? 'بعد الموافقة، سجّل عبر Google بنفس البريد ثم أدخل كلمة المرور وأكمل إعداد المصادقة الثنائية.' : role === 'teacher' ? 'طلب المدرس يظهر في لوحة الإدارة بنوع حساب مدرس. بعد الموافقة، استخدم بيانات الدخول التي أنشأتها.' : 'بعد موافقة الإدارة، استخدم بيانات الدخول التي أنشأتها.'}</p>
      {role !== 'admin' && <><div className="auth-divider"><span>أو استخدم Google</span></div><Link href={`/api/auth/google?role=${role}`} className="google-login-button"><Mail size={16} /> الدخول أو التسجيل باستخدام Google</Link></>}
      <Link href="/login" className="auth-back">لديك حساب؟ العودة للدخول</Link>
    </div></main>
  }

  if (!request) {
    return <main className="auth-page"><div className="auth-card card">
      <span className="eyebrow">REGISTRATION</span>
      <h1>التسجيل غير متاح بهذه الجلسة</h1>
      <p>ارجع إلى تسجيل الدخول وابدأ من زر المدرس أو الطالب.</p>
      <Link href="/login" className="button button-primary">العودة لتسجيل الدخول</Link>
    </div></main>
  }

  const isTeacher = request.requestedRole === 'teacher'
  const isAdmin = request.requestedRole === 'admin'
  const roleName = isTeacher ? 'المدرس' : isAdmin ? 'مسؤول الإدارة' : 'الطالب'

  if (request.status === 'approved') {
    return <main className="auth-page"><div className="auth-card card">
      <div className="auth-security-icon"><ShieldCheck size={22} /></div>
      <span className="eyebrow">APPROVED</span>
      <h1>تمت الموافقة</h1>
      <p>تم تفعيل حسابك كـ{roleName}. {isAdmin ? 'سجّل عبر Google بنفس البريد، ثم أدخل كلمة المرور ورمز التحقق.' : 'سجّل الدخول باستخدام بيانات الحساب التي أرسلتها.'}</p>
      <Link href={isAdmin || !isTeacher ? '/login' : '/api/auth/google?role=teacher'} className="button button-primary">الانتقال لتسجيل الدخول</Link>
    </div></main>
  }

  if (request.status === 'pending') {
    return <main className="auth-page"><div className="auth-card card">
      <div className="auth-security-icon"><Clock3 size={22} /></div>
      <span className="eyebrow">PENDING APPROVAL</span>
      <h1>تم استلام طلبك</h1>
      <p role="status">{query.submitted === '1' ? 'تم إرسال طلبك بنجاح إلى إدارة المدرسة.' : 'طلب تسجيلك قيد المراجعة لدى إدارة المدرسة.'}</p>
      <p>بعد مراجعة بياناتك والموافقة، ستتمكن من استخدام المنصة.</p>
      <div className="registration-summary">
        {request.email && !request.email.endsWith('@school-pulse.invalid') && <div><span>حساب Google</span><strong dir="ltr">{request.email}</strong></div>}
        <div><span>نوع الحساب</span><strong>{roleName}</strong></div>
        <div><span>الاسم</span><strong>{request.fullName || request.googleName || '—'}</strong></div>
        {request.phone && <div><span>الهاتف</span><strong dir="ltr">{request.phone}</strong></div>}
      </div>
      <Link href="/login" className="auth-secondary">العودة لتسجيل الدخول</Link>
    </div></main>
  }

  if (request.status === 'rejected') {
    return <main className="auth-page"><div className="auth-card card">
      <div className="auth-security-icon"><ShieldCheck size={22} /></div>
      <span className="eyebrow">REGISTRATION</span>
      <h1>تم رفض الطلب</h1>
      <p>{request.rejectionReason || 'يمكنك بدء طلب جديد من خلال حساب Google.'}</p>
      <Link href={`/api/auth/google?role=${isTeacher ? 'teacher' : 'student'}`} className="button button-primary">بدء طلب جديد عبر Google</Link>
      <Link href="/login" className="auth-back">العودة لتسجيل الدخول</Link>
    </div></main>
  }

  return <main className="auth-page"><div className="auth-card card registration-card">
    <div className="auth-security-icon">{isTeacher ? <GraduationCap size={22} /> : <UserPlus size={22} />}</div>
    <span className="eyebrow">{isTeacher ? 'TEACHER REGISTRATION' : 'STUDENT REGISTRATION'}</span>
    <h1>إنشاء حساب {roleName}</h1>
    <p>تم التحقق من حساب Google. أكمل بياناتك حتى يصل الطلب إلى إدارة المدرسة للمراجعة والموافقة.</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="registration-google"><Mail size={16} /><span dir="ltr">{request.email}</span></div>
    <form action={submitRegistrationAction} className="form-stack">
      <label>الاسم الثلاثي<input name="fullName" defaultValue={request.fullName ?? request.googleName ?? ''} autoComplete="name" required /></label>
      <label>تاريخ الميلاد<input name="birthDate" type="date" required /></label>
      <label>رقم الهاتف<input name="phone" type="tel" inputMode="tel" placeholder="07xxxxxxxxx" autoComplete="tel" required /></label>
      {isTeacher ? <label>الاختصاص / المادة<select name="subjectId" required defaultValue={request.subjectId ?? ''}><option value="">اختر المادة</option>{subjectsRows.map((item) => <option key={item.id} value={item.id}>{item.nameAr} · {item.code}</option>)}</select></label> : <label>الصف<select name="classId" required defaultValue={request.classId ?? ''}><option value="">اختر الصف</option>{classesRows.map((item) => <option key={item.id} value={item.id}>{item.nameAr} · المرحلة {item.gradeLevel}{item.section ? ` · ${item.section}` : ''}</option>)}</select></label>}
      <button className="button button-primary" type="submit">إرسال طلب التسجيل إلى الإدارة</button>
    </form>
    <p className="registration-note">بعد إرسال الطلب، ستراجع إدارة المدرسة بياناتك وتفعّل الحساب بعد الموافقة.</p>
    <Link href="/login" className="auth-back">إلغاء والعودة</Link>
  </div></main>
}
