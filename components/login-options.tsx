'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowUpLeft,
  BookOpen,
  Chrome,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { loginAction } from '@/app/login/actions'

type LoginOptionsProps = {
  error?: string
  errorMessage?: string
  initialRole?: 'student' | 'teacher' | 'admin'
  adminGoogleEmail?: string | null
  googleVerified?: boolean
}

type LoginRole = 'student' | 'teacher' | 'admin'

const roles: { id: LoginRole; title: string; description: string; Icon: typeof GraduationCap }[] = [
  { id: 'student', title: 'الدخول كطالب', description: 'الدرجات والواجبات', Icon: UserRound },
  { id: 'teacher', title: 'الدخول كمدرس', description: 'المتابعة والتواصل', Icon: GraduationCap },
  { id: 'admin', title: 'دخول الإدارة', description: 'إدارة المنصة', Icon: ShieldCheck },
]

export function LoginOptions({ error, errorMessage, initialRole, adminGoogleEmail, googleVerified }: LoginOptionsProps) {
  const [selectedRole, setSelectedRole] = useState<LoginRole | null>(initialRole ?? null)

  return (
    <>
      {errorMessage && (
        <div className="form-error login-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="login-role-actions" role="group" aria-label="اختر نوع الحساب">
        {roles.map(({ id, title, description, Icon }) => (
          <button
            key={id}
            className={`login-role-button${selectedRole === id ? ' is-selected' : ''}`}
            type="button"
            onClick={() => setSelectedRole(id)}
            aria-pressed={selectedRole === id}
            aria-controls={selectedRole === id ? 'login-role-panel' : undefined}
          >
            <span className="login-role-icon"><Icon size={19} strokeWidth={1.9} /></span>
            <span className="login-role-copy">
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <ArrowUpLeft size={16} className="login-button-arrow" />
          </button>
        ))}
      </div>

      {selectedRole && (
        <section className="login-role-panel" id="login-role-panel" aria-live="polite">
          <div className="login-role-panel-heading">
            <span className="login-role-panel-icon">
              {selectedRole === 'admin' ? <ShieldCheck size={19} /> : selectedRole === 'teacher' ? <GraduationCap size={19} /> : <BookOpen size={19} />}
            </span>
            <div>
              <h2>{selectedRole === 'admin' ? 'دخول الإدارة' : selectedRole === 'teacher' ? 'دخول المدرسين' : 'دخول الطلاب'}</h2>
              <p>استخدم البريد الإلكتروني أو اسم المستخدم أو رقم الهاتف وكلمة المرور. ويمكنك أيضًا الدخول عبر Google.</p>
            </div>
          </div>

          <form action={loginAction} className="form-stack login-form">
            <input type="hidden" name="loginRole" value={selectedRole} />
            {selectedRole === 'admin' && adminGoogleEmail && googleVerified && (
              <div className="login-verified-identity">
                <span className="login-role-icon"><ShieldCheck size={18} /></span>
                <span><small>تم التحقق من حساب Google</small><strong dir="ltr">{adminGoogleEmail}</strong></span>
              </div>
            )}
            <label>
              <span>البريد الإلكتروني أو اسم المستخدم أو رقم الهاتف</span>
              <input
                name="identifier"
                autoComplete="username"
                placeholder="name@example.com أو اسم المستخدم أو 07xxxxxxxxx"
                dir="auto"
                required
              />
            </label>
            <label>
              <span>كلمة المرور</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="أدخل كلمة المرور"
                required
              />
            </label>
            <button className="button button-primary login-submit" type="submit">
              <LockKeyhole size={17} />
              <span>{selectedRole === 'admin' ? 'دخول الإدارة' : selectedRole === 'teacher' ? 'دخول المدرس' : 'دخول الطالب'}</span>
              <ArrowUpLeft size={17} className="login-button-arrow" />
            </button>
          </form>

          {selectedRole === 'student' && (
            <div className="login-student-links">
              <Link href="/register?method=password"><UserRound size={15} /> إنشاء حساب طالب</Link>
              <Link href="/api/auth/google?role=student"><Chrome size={15} /> المتابعة باستخدام Google</Link>
            </div>
          )}
          {selectedRole === 'teacher' && (
            <div className="login-student-links">
              <Link className="login-account-create" href="/register?method=password&role=teacher"><GraduationCap size={15} /> إنشاء حساب مدرس</Link>
              <Link href="/api/auth/google?role=teacher"><Chrome size={15} /> الدخول أو التسجيل باستخدام Google</Link>
            </div>
          )}
          {selectedRole === 'admin' && (
            <div className="login-student-links">
              <Link href="/api/auth/google?role=admin"><Chrome size={15} /> المتابعة باستخدام Google</Link>
              <Link className="login-account-create" href="/register?method=password&role=admin"><ShieldCheck size={15} /> إنشاء حساب إدارة (يتطلب الموافقة)</Link>
            </div>
          )}
        </section>
      )}

      {error && !errorMessage && <div className="form-error login-error" role="alert">تعذر تسجيل الدخول. حاول مرة أخرى.</div>}
    </>
  )
}
