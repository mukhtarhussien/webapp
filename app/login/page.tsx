import { inArray } from 'drizzle-orm'
import Link from 'next/link'
import {
  BookOpen,
  GraduationCap,
  ShieldCheck,
} from 'lucide-react'
import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { LoginOptions } from '@/components/login-options'
import { LoginExperience } from '@/components/login-experience'
import { getAdminGoogleLoginIdentity } from '@/lib/google'

export const dynamic = 'force-dynamic'

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string; google?: string }>
}) {
  const { error, role, google } = await searchParams
  const adminGoogleIdentity = role === 'admin' ? await getAdminGoogleLoginIdentity() : null

  const messages: Record<string, string> = {
    missing: 'أدخل البريد الإلكتروني أو اسم المستخدم أو رقم الهاتف وكلمة المرور.',
    invalid: 'بيانات الدخول غير صحيحة.',
    role_mismatch: 'هذا الحساب لا يطابق نوع الدخول المختار.',
    rate_limited: 'توقفت المحاولات مؤقتًا. انتظر قليلًا ثم حاول مجددًا.',
    password_locked: 'تم إيقاف محاولات كلمة المرور مؤقتًا بسبب تكرار المحاولات الفاشلة.',
    google_not_configured: 'تسجيل الدخول باستخدام Google غير مهيأ حاليًا.',
    google_cancelled: 'تم إلغاء تسجيل الدخول باستخدام Google.',
    google_state: 'انتهت جلسة Google. ابدأ تسجيل الدخول من جديد.',
    google_profile: 'تعذر التحقق من حساب Google.',
    google_wrong_role: 'هذا حساب Google مرتبط بنوع حساب آخر. اختر زر الدخول المناسب له.',
    registration_expired: 'انتهت جلسة التسجيل. ابدأ من جديد.',
    account_inactive: 'هذا الحساب غير مفعّل حاليًا. راجع إدارة المدرسة.',
  }

  const settings = db
    ? await db
        .select()
        .from(siteSettings)
        .where(
          inArray(siteSettings.key, [
            'portal_logo_url',
            'portal_name_ar',
            'portal_name_en',
          ]),
        )
        .limit(3)
    : []

  const map = new Map(
    settings.map((item) => [
      item.key,
      String((item.value as { value?: string })?.value ?? ''),
    ]),
  )

  const logoUrl = map.get('portal_logo_url') || ''
  const schoolName = 'إعدادية الفدائي للبنين'
  const portalNameEn = map.get('portal_name_en') || 'School Portal'

  return (
    <LoginExperience
      logoUrl={logoUrl}
      portalNameAr={schoolName}
      portalNameEn={portalNameEn}
    >
      <main className="auth-page login-page">
        <div className="login-layout">
          <aside className="login-showcase">
            <div className="login-showcase-top">
              <div className="login-brand-mark">
                {logoUrl ? (
                  <img src={logoUrl} alt="" />
                ) : (
                  <GraduationCap size={27} strokeWidth={1.7} />
                )}
              </div>
              <span className="login-brand-label">{portalNameEn}</span>
            </div>

            <div className="login-showcase-content">
              <span className="login-overline">
                <span className="login-status-dot" />
                مساحة تعليمية واحدة
              </span>

              <h2>
                تعلّمك،
                <br />
                <span>إنجازاتك،</span>
                <br />
                ومستقبلك.
              </h2>

              <p>
                تابع دراستك وتواصل مع مدرستك من خلال بوابة واحدة،
                صُممت لتجعل الوصول إلى معلوماتك أسهل وأكثر وضوحًا.
              </p>

              <div className="login-feature-list">
                <div className="login-feature">
                  <span className="login-feature-icon">
                    <BookOpen size={18} />
                  </span>
                  <span>
                    <strong>كل شيء دراسي بمكان واحد</strong>
                    <small>الدرجات والواجبات والإعلانات</small>
                  </span>
                </div>

                <div className="login-feature">
                  <span className="login-feature-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <span>
                    <strong>وصول آمن لحسابك</strong>
                    <small>تسجيل دخول وحماية للحساب</small>
                  </span>
                </div>
              </div>
            </div>

            <div className="login-showcase-footer">
              <span>بوابتك التعليمية للطلاب والمدرسين</span>
            </div>

            <span className="login-decor login-decor-one" />
            <span className="login-decor login-decor-two" />
          </aside>

          <section className="login-panel">
            <div className="login-panel-heading">
              <span className="login-panel-kicker">أهلًا بعودتك</span>
              <h1>تسجيل الدخول</h1>
              <p>اختر طريقة الدخول المناسبة لحسابك.</p>
            </div>

            <div className="auth-card card login-card">
              <LoginOptions error={error} errorMessage={error ? messages[error] : undefined} initialRole={role === 'student' || role === 'teacher' || role === 'admin' ? role : undefined} adminGoogleEmail={adminGoogleIdentity?.email ?? null} googleVerified={google === 'verified'} />

              <div className="login-security-note">
                <ShieldCheck size={16} />
                <span>لا تشارك كلمة المرور أو رموز التحقق مع أي شخص.</span>
              </div>

              <div className="login-card-links">
                <Link href="/rules">قواعد المنصة</Link>
                <span>·</span>
                <Link href="/">العودة إلى البوابة</Link>
              </div>
            </div>

          </section>
        </div>
      </main>
    </LoginExperience>
  )
}
