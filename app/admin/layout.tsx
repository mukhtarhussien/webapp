import Link from 'next/link'
import { LayoutDashboard, LogOut, School, ShieldCheck } from 'lucide-react'
import { guardAdmin } from '@/lib/admin'
import { clearSession } from '@/lib/auth'

async function logoutAction() {
  'use server'
  await clearSession()
}

export default async function AdminLayout({children}:{children:React.ReactNode}) {
  const admin=await guardAdmin({ allowUnconfigured: true })
  return <div className="admin-root" dir="rtl">
    <aside className="admin-sidebar">
      <div className="admin-brand"><div className="brand-mark"><School size={20}/></div><div><strong>School Pulse</strong><span>Admin Console</span></div></div>
      <div className="admin-user"><span className="admin-avatar">{admin.preferences?.profilePhotoKey ? <img src={`/api/profile-photo/${admin.id}?v=${encodeURIComponent(admin.preferences.profilePhotoKey)}`} alt=""/> : admin.fullNameAr.slice(0,1)}</span><div><strong>{admin.fullNameAr}</strong><span>مدير النظام</span></div></div>
      <nav className="admin-nav"><Link href="/admin"><LayoutDashboard size={18}/> لوحة التحكم</Link><Link href="/admin/security"><ShieldCheck size={18}/> أمان الحساب</Link></nav>
      <form action={logoutAction} className="admin-logout"><button type="submit"><LogOut size={17}/> تسجيل الخروج</button></form>
    </aside>
    <main className="admin-main">{children}</main>
  </div>
}
