'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Bell, BellOff, CalendarDays, Check, ChevronDown, Download, FileText, GraduationCap, Home, Languages, Map, Menu, MessageCircle, Moon, Palette, Settings2, ShieldCheck, Sun, UserRound, Users, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LanguageProvider, useLanguage } from './language'
import { MotionToggle } from '@/components/motion-toggle'
import type { User } from '@/db/schema'

type Theme = 'light' | 'dark' | 'amoled'
type ThemeOption = { id: Theme; ar: string; en: string; descriptionAr: string; descriptionEn: string; icon: LucideIcon }
const themes: ThemeOption[] = [
  { id: 'light', ar: 'فاتح', en: 'Light', descriptionAr: 'هادئ وواضح', descriptionEn: 'Calm and clear', icon: Sun },
  { id: 'dark', ar: 'داكن', en: 'Dark', descriptionAr: 'داكن مريح للعين', descriptionEn: 'Comfortable dark palette', icon: Moon },
  { id: 'amoled', ar: 'داكن (موصى به لشاشات AMOLED / OLED)', en: 'Dark (recommended for AMOLED / OLED screens)', descriptionAr: 'أسود حقيقي', descriptionEn: 'True black', icon: Palette },
]
const nav = [
  { href: '/', label: 'الرئيسية', en: 'Home', icon: Home },
  { href: '/grades', label: 'الدرجات', en: 'Grades', icon: BarChart3 },
  { href: '/notifications', label: 'الإشعارات', en: 'Notifications', icon: Bell },
  { href: '/calendar', label: 'التقويم', en: 'Calendar', icon: CalendarDays },
  { href: '/community', label: 'المجتمع', en: 'Community', icon: Users },
]
const mobileNav = [nav[1], nav[3], nav[0], nav[2], nav[4]]

type ShellProps = { children: React.ReactNode; currentUser: User | null; portalLogoUrl?: string; portalNameAr?: string; portalNameEn?: string }
export function AppShell(props: ShellProps) {
  return <LanguageProvider><ShellInner {...props} /></LanguageProvider>
}

function ShellInner({ children, currentUser, portalLogoUrl = '', portalNameAr = 'مدرستي', portalNameEn = 'School Portal' }: ShellProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('light')
  const [themeReady, setThemeReady] = useState(false)
  const [themeAnimating, setThemeAnimating] = useState(false)
  const { isEn, toggle } = useLanguage()
  const notificationsMuted = Boolean(currentUser?.preferences?.notificationsMuted)

  useEffect(() => {
    const saved = window.localStorage.getItem('school-pulse-theme')
    if (saved === 'light' || saved === 'dark' || saved === 'amoled') setTheme(saved)
    setThemeReady(true)
  }, [])
  useEffect(() => {
    if (!themeReady) return
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark'
    window.localStorage.setItem('school-pulse-theme', theme)
  }, [theme, themeReady])
  if (pathname.startsWith('/admin') || pathname.startsWith('/login')) return <>{children}</>

  const selectTheme = (next: Theme) => {
    if (next === theme) { setThemeOpen(false); return }
    setThemeAnimating(true); setTheme(next); setThemeOpen(false)
  }
  const currentTheme = themes.find(item => item.id === theme) ?? themes[0]
  const ThemeIcon = currentTheme.icon
  return <div className="app-root" dir={isEn ? 'ltr' : 'rtl'}>
    <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
      <div className="brand"><div className="brand-mark">{portalLogoUrl ? <img className="brand-logo-image" src={portalLogoUrl} alt=""/> : <GraduationCap size={20}/>}</div><div><strong>{portalNameAr}</strong><span>{portalNameEn}</span></div></div>
      <div className="side-profile"><div className="profile-avatar">{currentUser?.preferences?.profilePhotoKey && currentUser.id ? <img src={`/api/profile-photo/${currentUser.id}?v=${encodeURIComponent(currentUser.preferences.profilePhotoKey)}`} alt=""/> : currentUser?.fullNameAr?.slice(0, 1) ?? '?'}</div><div><strong>{currentUser ? (isEn ? currentUser.fullNameEn : currentUser.fullNameAr) : (isEn ? 'Guest' : 'زائر')}</strong><span>{currentUser ? (currentUser.role === 'teacher' ? (isEn ? 'Teacher' : 'مدرس') : currentUser.role === 'admin' ? (isEn ? 'Administrator' : 'مدير النظام') : (isEn ? 'Student' : 'طالب')) : (isEn ? 'Sign in to view your data' : 'سجّل الدخول لعرض بياناتك')}</span></div><ChevronDown size={16}/></div>
      <nav className="side-nav">{nav.map(({ href, label, en, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} onClick={() => setMenuOpen(false)}><Icon size={18}/><span>{isEn ? en : label}</span></Link>)}<div className="nav-divider"/><Link href="/map" className={pathname === '/map' ? 'active' : ''} onClick={() => setMenuOpen(false)}><Map size={18}/><span>{isEn ? 'Campus map' : 'الخريطة'}</span></Link><Link href="/messages" className={pathname === '/messages' ? 'active' : ''} onClick={() => setMenuOpen(false)}><MessageCircle size={18}/><span>{isEn ? 'Messages' : 'الرسائل'}</span></Link><Link href="/uploads" className={pathname === '/uploads' ? 'active' : ''} onClick={() => setMenuOpen(false)}><FileText size={18}/><span>{isEn ? 'My files' : 'ملفاتي'}</span></Link><Link href="/account" className={pathname === '/account' ? 'active' : ''} onClick={() => setMenuOpen(false)}><UserRound size={18}/><span>{isEn ? 'My account' : 'حسابي'}</span></Link></nav>
      <div className="sidebar-footer"><div className="secure-line"><ShieldCheck size={15}/>{isEn ? 'School portal' : 'بوابة المدرسة'}</div><span>v2.2</span></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label={isEn ? 'Close menu' : 'إغلاق القائمة'}/>}
    <main className="main-shell">
      <header className="topbar"><button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label={isEn ? 'Open menu' : 'فتح القائمة'}><Menu size={20}/></button><div className="topbar-title"><span>{portalNameEn}</span><strong>{currentUser ? (isEn ? 'Connected to your account' : 'متصل بحسابك') : (isEn ? 'Guest view' : 'وضع الزائر')}</strong></div><div className="top-actions">
        <div className="theme-control"><button className={'theme-trigger theme-trigger-' + theme} onClick={() => setThemeOpen(v => !v)} aria-haspopup="menu" aria-expanded={themeOpen} title={isEn ? 'Theme' : 'المظهر'}><ThemeIcon size={17}/><span className="theme-trigger-text">{isEn ? currentTheme.en : currentTheme.ar}</span><ChevronDown size={14} className={'theme-chevron' + (themeOpen ? ' open' : '')}/></button>{themeOpen && <div className="theme-menu" role="menu"><div className="theme-menu-heading">{isEn ? 'Appearance' : 'المظهر'}<span>{isEn ? 'Choose the portal theme' : 'اختَر شكل المنصة'}</span></div>{themes.map(option => { const Icon = option.icon; const active = option.id === theme; return <button key={option.id} className={'theme-option' + (active ? ' active' : '')} onClick={() => selectTheme(option.id)} role="menuitemradio" aria-checked={active}><span className={'theme-option-icon theme-option-' + option.id}><Icon size={17}/></span><span className="theme-option-copy"><strong>{isEn ? option.en : option.ar}</strong><small>{isEn ? option.descriptionEn : option.descriptionAr}</small></span>{active && <Check size={16} className="theme-check"/>}</button>})}</div>}</div>
        <button className="lang-button" onClick={toggle}><Languages size={17}/><span>{isEn ? 'العربية' : 'EN'}</span></button>
        <Link className="top-action" href="/api/app/download" aria-label={isEn ? 'Download app' : 'تنزيل التطبيق'} title={isEn ? 'Download the app' : 'تنزيل التطبيق'}><Download size={18}/></Link>
        <Link className="top-action" href="/messages" aria-label={isEn ? 'Messages' : 'الرسائل'}><MessageCircle size={19}/></Link>
        <Link className={'top-action' + (notificationsMuted ? ' is-muted' : '')} href="/notifications" aria-label={isEn ? 'Notifications' : 'الإشعارات'} title={notificationsMuted ? 'الإشعارات مكتومة' : undefined}>{notificationsMuted ? <BellOff size={19}/> : <Bell size={19}/>}</Link>
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label={isEn ? 'More' : 'المزيد'}><Menu size={20}/></button>
      </div></header>
      <div className="content-wrap"><div key={pathname} className="page-transition">{children}</div></div>
      <nav className="bottom-nav" aria-label={isEn ? 'Main navigation' : 'التنقل الرئيسي'}>{mobileNav.map(({ href, label, en, icon: Icon }) => <Link key={href} href={href} className={`${pathname === href ? 'active' : ''}${href === '/' ? ' home-tab' : ''}`} aria-current={pathname === href ? 'page' : undefined}><Icon size={18}/><span>{isEn ? en : label}</span></Link>)}</nav>
    </main>
    {menuOpen && <div className="drawer"><div className="drawer-head"><div className="drawer-title"><div className="brand-mark">{portalLogoUrl ? <img className="brand-logo-image" src={portalLogoUrl} alt=""/> : <GraduationCap size={18}/>}</div><div><strong>{isEn ? 'More' : 'المزيد'}</strong><span>{isEn ? 'Useful portal links' : 'روابط وخيارات إضافية'}</span></div></div><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label={isEn ? 'Close' : 'إغلاق'}><X size={19}/></button></div><div className="drawer-links">
      <Link href="/messages" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><MessageCircle size={18}/></div><div><strong>{isEn ? 'Private messages' : 'الرسائل الخاصة'}</strong><span>{isEn ? 'Private chats with school accounts' : 'محادثات خاصة مع حسابات المدرسة'}</span></div></Link>
      <Link href="/uploads" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><FileText size={18}/></div><div><strong>{isEn ? 'Uploaded files' : 'الملفات التي رفعتها'}</strong><span>{isEn ? 'Your saved files' : 'ملفاتك المحفوظة'}</span></div></Link>
      <Link href="/progress" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><BarChart3 size={18}/></div><div><strong>{isEn ? 'My progress' : 'تقدّمي'}</strong><span>{isEn ? 'Your academic summary' : 'ملخص تقدمك الدراسي'}</span></div></Link>
      <Link href="/rules" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><ShieldCheck size={18}/></div><div><strong>{isEn ? 'School rules' : 'قواعد المنصة'}</strong><span>{isEn ? 'Policies and conduct' : 'السياسات والسلوك'}</span></div></Link>
      <Link href="/account" onClick={() => setMenuOpen(false)}><div className="drawer-icon neutral"><Settings2 size={18}/></div><div><strong>{isEn ? 'Account settings' : 'إعدادات الحساب'}</strong><span>{isEn ? 'Edit your account and preferences' : 'تعديل الحساب والتفضيلات'}</span></div></Link>
      <Link href="/api/app/download" className="drawer-download" onClick={() => setMenuOpen(false)}><div className="drawer-icon accent"><Download size={18}/></div><div><strong>{isEn ? 'Download the app' : 'تنزيل التطبيق'}</strong><span>{isEn ? 'Official Android release' : 'نسخة أندرويد الرسمية'}</span></div><Download size={17}/></Link>
      <div className="drawer-motion"><MotionToggle compact/></div>
    </div></div>}
    {themeAnimating && <div className={'theme-transition theme-transition-' + theme} onAnimationEnd={() => setThemeAnimating(false)} aria-hidden="true"/>}
  </div>
}
