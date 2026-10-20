import { buildTotpUri, decryptTotpSecret } from '@/lib/totp'
import { guardAdmin } from '@/lib/admin'
import { TotpManagement, TotpSetup } from './security-client'

export const dynamic = 'force-dynamic'

export default async function AdminSecurityPage() {
  const admin = await guardAdmin({ allowUnconfigured: true })
  const secret = admin.twoFactorEnabled ? null : decryptTotpSecret(admin.twoFactorSecretEncrypted)
  const uri = secret ? buildTotpUri(secret, admin.email) : null
  return <div className="security-page"><header className="admin-header"><div><span className="eyebrow">SECURITY CENTER</span><h1>أمان حساب الأدمن</h1><p>حماية لوحة المدرسة بالمصادقة الثنائية مع Google Authenticator.</p></div><div className="admin-health"><strong>{admin.twoFactorEnabled?'TOTP مفعّل':'TOTP غير مفعّل'}</strong></div></header><div className="security-stack"><TotpSetup email={admin.email} secret={secret} uri={uri} enabled={admin.twoFactorEnabled}/><TotpManagement enabled={admin.twoFactorEnabled}/></div></div>
}
