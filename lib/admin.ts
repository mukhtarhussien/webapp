import 'server-only'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'

export async function guardAdmin(options: { allowUnconfigured?: boolean } = {}) {
  const admin = await requireAdmin()
  if (!admin) redirect('/login?next=/admin')
  if (!admin.twoFactorEnabled && !options.allowUnconfigured) redirect('/admin/security?setup=1')
  return admin
}
