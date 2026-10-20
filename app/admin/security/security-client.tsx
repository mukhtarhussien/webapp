 'use client'
import { useActionState } from 'react'
import { useEffect, useState } from 'react'
import { beginTotpSetupAction, confirmTotpSetupAction, disableTotpAction, regenerateRecoveryCodesAction } from '../actions'

type State = { ok?: boolean; error?: string; recoveryCodes?: string[] }
const initial: State = {}

function RecoveryCodes({ codes, title='أكواد الاسترداد' }: { codes: string[]; title?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(codes.join('\n'))
    setCopied(true)
  }
  return <div className="security-recovery"><div className="security-title-row"><h3>{title}</h3><button type="button" className="admin-small-button" onClick={copy}>{copied?'تم النسخ':'نسخ الأكواد'}</button></div><p>احفظ هذه الأكواد في مكان آمن. كل كود يُستخدم مرة واحدة.</p><div className="recovery-code-grid">{codes.map(code=><code key={code}>{code}</code>)}</div></div>
}

export function TotpSetup({ email, secret, uri, enabled }: { email: string; secret: string | null; uri: string | null; enabled: boolean }) {
  const [state, action, pending] = useActionState<State, FormData>(confirmTotpSetupAction, initial)
  return <section className="security-card"><div className="security-heading"><div><span className="eyebrow">GOOGLE AUTHENTICATOR</span><h2>المصادقة الثنائية TOTP</h2><p>اربط حساب الأدمن بتطبيق Google Authenticator. الرمز يتغير كل 30 ثانية.</p></div><span className="security-pill">{enabled?'مفعّل':secret?'جاهز للربط':'غير مفعّل'}</span></div>{enabled ? <div className="security-form"><p>المصادقة الثنائية مفعّلة. لا يُعرض المفتاح السري بعد التفعيل.</p></div> : !secret ? <form action={beginTotpSetupAction} className="security-form"><p>اضغط للبدء وتوليد مفتاح خاص لهذا الحساب.</p><button className="button button-primary" type="submit">بدء إعداد TOTP</button></form> : <div className="security-setup-grid"><div className="security-box"><h3>1. أضف الحساب</h3><p>في Google Authenticator اختر إضافة حساب ثم أدخل المفتاح يدويًا.</p><label className="admin-field"><span>الحساب</span><input value={email} readOnly /></label><label className="admin-field"><span>المفتاح السري</span><input value={secret} readOnly /></label><label className="admin-field"><span>رابط الإعداد</span><textarea value={uri ?? ''} readOnly rows={4} /></label></div><div className="security-box"><h3>2. أثبت الربط</h3><p>أدخل الرمز الحالي من التطبيق لتفعيل الحماية فعليًا.</p><form action={action} className="security-form"><label className="admin-field"><span>رمز TOTP</span><input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} required /></label>{state.error && <div className="form-error">{state.error}</div>}<button className="button button-primary" disabled={pending} type="submit">{pending?'جارٍ التحقق…':'تفعيل المصادقة الثنائية'}</button></form>{state.recoveryCodes && <RecoveryCodes codes={state.recoveryCodes} title="أكواد الاسترداد — احفظها الآن"/>}</div></div>}</section>
}

export function TotpManagement({ enabled }: { enabled: boolean }) {
  const [disableState, disableAction, disablePending] = useActionState<State, FormData>(disableTotpAction, initial)
  const [regenState, regenAction, regenPending] = useActionState<State, FormData>(regenerateRecoveryCodesAction, initial)
  return <section className="security-card"><div className="security-heading"><div><span className="eyebrow">ACCOUNT PROTECTION</span><h2>إدارة TOTP</h2><p>يمكنك إعادة توليد أكواد الاسترداد أو تعطيل المصادقة الثنائية بعد إعادة التحقق.</p></div><span className="security-pill security-pill-on">{enabled?'مفعّل':'غير مفعّل'}</span></div>{enabled && <div className="security-two-col"><form action={regenAction} className="security-box security-form"><h3>توليد أكواد استرداد جديدة</h3><label className="admin-field"><span>كلمة المرور الحالية</span><input name="password" type="password" autoComplete="current-password" required /></label><label className="admin-field"><span>رمز TOTP الحالي</span><input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></label>{regenState.error && <div className="form-error">{regenState.error}</div>}<button className="button button-secondary" disabled={regenPending} type="submit">{regenPending?'جارٍ التوليد…':'توليد أكواد جديدة'}</button>{regenState.recoveryCodes && <RecoveryCodes codes={regenState.recoveryCodes}/>}</form><form action={disableAction} className="security-box security-form"><h3>تعطيل TOTP</h3><p>التعطيل يتطلب كلمة المرور ورمزًا صالحًا من Authenticator.</p><label className="admin-field"><span>كلمة المرور الحالية</span><input name="password" type="password" autoComplete="current-password" required /></label><label className="admin-field"><span>رمز TOTP الحالي</span><input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></label>{disableState.error && <div className="form-error">{disableState.error}</div>}<button className="admin-danger security-danger-button" disabled={disablePending} type="submit">{disablePending?'جارٍ التعطيل…':'تعطيل المصادقة الثنائية'}</button></form></div>}</section>
}
