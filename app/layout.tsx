import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppShell } from '@/components/app-shell'
import { MotionBootstrap } from '@/components/motion-bootstrap'
import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'مدرستي | School Portal',
  description: 'بوابة مدرسية ثنائية اللغة للدرجات والواجبات والتواصل.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser()
  const rows = db ? await db.select().from(siteSettings).limit(50) : []
  const settings = new Map(rows.map(row => [row.key, String((row.value as { value?: string })?.value ?? '')]))
  return <html lang="ar" dir="rtl"><body><MotionBootstrap/><AppShell currentUser={user} portalLogoUrl={settings.get('portal_logo_url') || ''} portalNameAr={settings.get('portal_name_ar') || 'مدرستي'} portalNameEn={settings.get('portal_name_en') || 'School Portal'}>{children}</AppShell></body></html>
}
