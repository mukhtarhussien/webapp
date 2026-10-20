import Link from 'next/link'
import {
  ArrowUpLeft,
  KeyRound,
  ShieldCheck,
} from 'lucide-react'
import {
  verifyTwoFactorAction,
  cancelTwoFactorAction,
} from '../actions'

export default async function TwoFactorLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const messages: Record<string, string> = {
    missing: 'أدخل رمز التحقق.',
    invalid: 'الرمز غير صحيح. تحقق منه وحاول مجددًا.',
    expired: 'انتهت جلسة التحقق. سجّل الدخول من جديد.',
    locked: 'تم إيقاف محاولة التحقق بعد عدة محاولات فاشلة.',
  }

  const message = messages[error ?? ''] || 'أكمل التحقق بخطوتين.'

  return (
    <main className="auth-page login-page login-two-factor-page">
      <div className="login-layout login-layout-compact">
        <aside className="login-showcase login-showcase-compact">
          <div className="login-showcase-top">
            <div className="login-brand-mark">
              <ShieldCheck size={27} strokeWidth={1.7} />
            </div>
            <span className="login-brand-label">ACCOUNT SECURITY</span>
          </div>

          <div className="login-showcase-content">
            <span className="login-overline">
              <span className="login-status-dot" />
              خطوة حماية إضافية
            </span>
            <h2>
              حسابك يستحق
              <br />
              <span>حماية أفضل.</span>
            </h2>
            <p>
              أكمل التحقق للتأكد من هويتك قبل الوصول إلى حساب الإدارة.
            </p>
          </div>

          <div className="login-showcase-footer">
            <span>التحقق بخطوتين</span>
            <span>•</span>
            <span>حماية الحساب</span>
          </div>
          <span className="login-decor login-decor-one" />
          <span className="login-decor login-decor-two" />
        </aside>

        <section className="login-panel">
          <div className="login-panel-heading">
            <span className="login-panel-kicker">التحقق من الهوية</span>
            <h1>خطوة أخيرة</h1>
            <p>أدخل رمز التحقق لإكمال تسجيل الدخول.</p>
          </div>

          <div className="auth-card card login-card login-two-factor-card">
            <div className="login-two-factor-icon">
              <KeyRound size={24} />
            </div>

            <h2 className="login-two-factor-title">التحقق بخطوتين</h2>
            <p className="login-two-factor-description">
              أدخل رمز Google Authenticator المكوّن من 6 أرقام،
              أو أحد أكواد الاسترداد.
            </p>

            <div
              className="form-error login-error"
              data-tone={error === 'invalid' ? 'error' : 'info'}
              role="status"
            >
              {message}
            </div>

            <form
              action={verifyTwoFactorAction}
              className="form-stack login-form"
            >
              <label>
                <span>رمز التحقق</span>
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={12}
                  dir="ltr"
                  required
                  autoFocus
                />
              </label>

              <button
                className="button button-primary login-submit"
                type="submit"
              >
                <ShieldCheck size={17} />
                <span>تحقق ودخول</span>
                <ArrowUpLeft size={17} className="login-button-arrow" />
              </button>
            </form>

            <form action={cancelTwoFactorAction} className="login-cancel-form">
              <button className="auth-secondary login-cancel" type="submit">
                إلغاء تسجيل الدخول
              </button>
            </form>

            <Link href="/login" className="auth-back login-back">
              العودة إلى صفحة الدخول
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
