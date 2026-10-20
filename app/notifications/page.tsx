import { and, desc, eq, or, sql } from 'drizzle-orm'
import { Bell, BellOff, CalendarDays, Megaphone } from 'lucide-react'
import { requireDb } from '@/db'
import { announcements, notifications } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { Localized } from '@/components/localized'
import { toggleNotificationsMutedAction } from './actions'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Notifications() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const db = requireDb()
  const muted = Boolean(user.preferences?.notificationsMuted)
  const [ann, personal] = await Promise.all([
    db.select({ id: announcements.id, titleAr: announcements.titleAr, titleEn: announcements.titleEn, bodyAr: announcements.bodyAr, bodyEn: announcements.bodyEn, publishedAt: announcements.publishedAt }).from(announcements).where(and(eq(announcements.published, true), or(eq(announcements.audience, 'all'), eq(announcements.audience, 'students'), and(eq(announcements.audience, 'class'), eq(announcements.classId, user.classId ?? '00000000-0000-0000-0000-000000000000'))))).orderBy(desc(announcements.publishedAt)).limit(20),
    db.select({ id: notifications.id, titleAr: notifications.titleAr, titleEn: notifications.titleEn, bodyAr: notifications.bodyAr, bodyEn: notifications.bodyEn, createdAt: notifications.createdAt }).from(notifications).where(or(eq(notifications.userId, user.id), sql.raw('notifications.user_id is null'))).orderBy(desc(notifications.createdAt)).limit(20),
  ])
  const items = [
    ...ann.map(item => ({ id: 'a-' + item.id, titleAr: item.titleAr, titleEn: item.titleEn, bodyAr: item.bodyAr, bodyEn: item.bodyEn, at: item.publishedAt, important: true })),
    ...personal.map(item => ({ id: 'n-' + item.id, titleAr: item.titleAr, titleEn: item.titleEn, bodyAr: item.bodyAr, bodyEn: item.bodyEn, at: item.createdAt, important: false })),
  ].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))

  return <div className="notifications-page page-stack">
    <section className="page-card card">
      <div className="page-title-row"><div><span className="eyebrow">NOTIFICATIONS</span><h1 className="page-title"><Localized ar="الإشعارات والتبليغات" en="Notifications"/></h1><p className="page-subtitle"><Localized ar="إعلانات المدرسة والإشعارات الموجهة لحسابك." en="School announcements and alerts for your account."/></p></div><div className="quiet-icon">{muted ? <BellOff size={21}/> : <Bell size={21}/>}</div></div>
      <div className={'notification-preference ' + (muted ? 'is-muted' : '')}>
        <div className="notification-preference-icon">{muted ? <BellOff size={18}/> : <Bell size={18}/>}</div>
        <div><strong>{muted ? 'الإشعارات مكتومة' : 'الإشعارات مفعّلة'}</strong><p>{muted ? 'تم حفظ اختيارك في حسابك. سجل الإشعارات السابقة يبقى متاحًا.' : 'يمكنك كتم الإشعارات من هنا، وسيبقى سجل التبليغات متاحًا.'}</p></div>
        <form action={toggleNotificationsMutedAction}><button className={muted ? 'button button-primary' : 'button-secondary'} type="submit">{muted ? 'إلغاء الكتم' : 'كتم الإشعارات'}</button></form>
      </div>
      <div className="notifications-list">{items.map(item => <article className="notification-row" key={item.id}><div className="notice-icon">{item.important ? <Megaphone size={17}/> : <CalendarDays size={17}/>}</div><div className="notification-copy"><h3><Localized ar={item.titleAr} en={item.titleEn}/></h3><p><Localized ar={item.bodyAr} en={item.bodyEn}/></p><time>{item.at?.toLocaleString('ar-IQ') ?? ''}</time></div>{item.important && <span className="notification-type">إعلان</span>}</article>)}{items.length === 0 && <p className="quiet-empty">لا توجد تبليغات بعد.</p>}</div>
    </section>
  </div>
}
