import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { bootstrapAdminAction } from './actions'

export const dynamic = 'force-dynamic'

const errors: Record<string, string> = {
  disabled: 'إعداد الأدمن غير مفعّل. تحقق من متغيرات البيئة.',
  invalid: 'البيانات غير صحيحة. تحقق من الإيميل والرمز السري وكلمة المرور.',
  limited: 'محاولات كثيرة. انتظر ثم حاول مجددًا.',
  used: 'يوجد حساب أدمن مسبقًا. التهيئة الأولية مغلقة.',
  account: 'يوجد حساب بهذا الإيميل مسبقًا.',
}

export default async function AdminSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const query = await searchParams
  const expected = process.env.ADMIN_BOOTSTRAP_SECRET || ''

  const secretConfigured =
    expected.length >= 32 &&
    expected.length <= 256 &&
    process.env.NODE_ENV === 'production'

  const db = requireDb()

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1)

  const error = query.error
    ? errors[query.error] ?? null
    : null

  return (
    <main className="auth-page">
      <section className="auth-card card">
        <span className="eyebrow">ADMIN INITIALIZATION</span>
        <h1>إعداد حساب الإدارة</h1>

        {admins.length > 0 ? (
          <>
            <p role="status">
              يوجد حساب أدمن مسبقًا. الإعداد الأولي مغلق.
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
            <p>
              أدخل بريد حساب الإدارة الذي تريد إنشاءه،
              وسر التهيئة وكلمة المرور.
            </p>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <form
              action={bootstrapAdminAction}
              className="form-stack"
            >
              <label>
                بريد حساب الأدمن
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  dir="ltr"
                  required
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
                كلمة مرور حساب الأدمن
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
                <small>
                  يجب أن تكون بين 12 و128 حرفًا.
                </small>
              </label>

              <button
                className="button button-primary"
                type="submit"
              >
                إنشاء حساب الأدمن
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
