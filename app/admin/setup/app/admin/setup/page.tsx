import { and, eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { bootstrapAdminAction } from './actions'

export const dynamic = 'force-dynamic'

const errors: Record<string, string> = {
  disabled: 'إعداد الأدمن غير مفعّل. تحقق من متغيرات البيئة.',
  invalid: 'البيانات غير صحيحة. تحقق من الرمز السري وكلمة المرور.',
  limited: 'محاولات كثيرة. انتظر ثم حاول مجددًا.',
  used: 'تم إعداد حساب الإدارة مسبقًا.',
  account: 'يوجد حساب بهذا البريد مسبقًا.',
}

export default async function AdminSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const query = await searchParams
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase()

  const secretConfigured =
    Boolean(email) &&
    (process.env.ADMIN_BOOTSTRAP_SECRET || '').length >= 32 &&
    process.env.NODE_ENV === 'production'

  const db = requireDb()

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
    .limit(1)

  const error = query.error ? errors[query.error] ?? null : null

  return (
    <main className="auth-page">
      <section className="auth-card card">
        <span className="eyebrow">ADMIN INITIALIZATION</span>
        <h1>إعداد حساب الإدارة</h1>

        {admins.length > 0 ? (
          <>
            <p role="status">
              تم إعداد حساب الإدارة مسبقًا. الإعداد الأولي مغلق.
            </p>
            <a className="button button-primary" href="/login">
              تسجيل الدخول
            </a>
          </>
        ) : !secretConfigured ? (
          <p role="alert">
            الإعداد غير متاح. تحقق من متغيرات البيئة في Vercel.
          </p>
        ) : (
          <>
            <p>أدخل سر التهيئة وكلمة مرور جديدة لحساب الإدارة.</p>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <form action={bootstrapAdminAction} className="form-stack">
              <label>
                بريد حساب الإدارة
                <input
                  value={email}
                  readOnly
                  dir="ltr"
                  autoComplete="username"
                />
              </label>

              <label>
                سر التهيئة
                <input
                  name="secret"
                  type="password"
                  autoComplete="off"
                  minLength={32}
                  maxLength={256}
                  required
                />
              </label>

              <label>
                كلمة مرور حساب الإدارة
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
                <small>يجب أن تكون بين 12 و128 حرفًا.</small>
              </label>

              <button className="button button-primary" type="submit">
                إنشاء حساب الأدمن
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
