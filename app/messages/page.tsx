import Link from 'next/link'
import { asc, desc, eq, inArray, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Ban, Check, MessageCircle, Plus, Send, ShieldCheck, UserRound, UserRoundX, X } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireDb } from '@/db'
import { messageRequests, users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { ChatHistory } from '@/components/chat-history'
import { respondToMessageRequestAction, sendPrivateMessageAction, toggleBlockedUserAction } from './actions'

export const dynamic = 'force-dynamic'

const resultNotices: Record<string, string> = {
  sent: 'وصلت رسالتك.',
  accepted: 'تم قبول طلب التواصل. تقدرون تتبادلون الرسائل الآن.',
  rejected: 'تم رفض طلب التواصل.',
  invalid: 'تعذر إرسال الرسالة. تحقق من البيانات وحاول مرة ثانية.',
  unavailable: 'هذا الحساب غير متاح للتواصل حاليًا.',
}

function photoUrl(userId: string, key?: string) {
  return key ? `/api/profile-photo/${userId}?v=${encodeURIComponent(key)}` : ''
}

export default async function Messages({ searchParams }: { searchParams: Promise<{ result?: string; with?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const db = requireDb()
  const sender = alias(users, 'message_sender')
  const recipient = alias(users, 'message_recipient')
  const blockedIds = Array.isArray(user.preferences?.blockedUserIds) ? user.preferences.blockedUserIds : []
  const [query, contactRows, params] = await Promise.all([
    db.select({
      id: messageRequests.id,
      senderId: messageRequests.senderId,
      recipientId: messageRequests.recipientId,
      body: messageRequests.body,
      subject: messageRequests.subject,
      status: messageRequests.status,
      createdAt: messageRequests.createdAt,
      senderAr: sender.fullNameAr,
      senderPreferences: sender.preferences,
      recipientAr: recipient.fullNameAr,
      recipientPreferences: recipient.preferences,
    }).from(messageRequests)
      .innerJoin(sender, eq(sender.id, messageRequests.senderId))
      .innerJoin(recipient, eq(recipient.id, messageRequests.recipientId))
      .where(or(eq(messageRequests.recipientId, user.id), eq(messageRequests.senderId, user.id)))
      .orderBy(desc(messageRequests.createdAt)).limit(200),
    db.select({
      id: users.id,
      nameAr: users.fullNameAr,
      role: users.role,
      preferences: users.preferences,
    }).from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.fullNameAr)),
    searchParams,
  ])

  const unavailableIds = new Set([
    ...blockedIds,
    ...contactRows.filter(contact => contact.preferences?.blockedUserIds?.includes(user.id)).map(contact => contact.id),
  ])
  const contacts = contactRows.filter(contact => contact.id !== user.id && !unavailableIds.has(contact.id))
  const visibleRows = query.filter(row => {
    const otherId = row.senderId === user.id ? row.recipientId : row.senderId
    return !unavailableIds.has(otherId)
  })
  const recentByContact = new Map<string, { id: string; name: string; photoKey?: string; preview: string }>()
  for (const row of visibleRows) {
    const otherId = row.senderId === user.id ? row.recipientId : row.senderId
    if (recentByContact.has(otherId)) continue
    const name = row.senderId === user.id ? row.recipientAr : row.senderAr
    const preferences = row.senderId === user.id ? row.recipientPreferences : row.senderPreferences
    recentByContact.set(otherId, { id: otherId, name, photoKey: preferences?.profilePhotoKey, preview: row.body })
  }
  const recentChats = [...recentByContact.values()]
  const selectedContact = contacts.find(contact => contact.id === params.with)
    ?? contacts.find(contact => contact.id === recentChats[0]?.id)
  const selectedId = selectedContact?.id ?? ''
  const threadRows = selectedId
    ? visibleRows.filter(row => row.senderId === selectedId || row.recipientId === selectedId).slice().reverse()
    : []
  const connected = threadRows.some(row => row.status === 'accepted' || row.status === 'read')
  const incomingPending = threadRows.filter(row => row.status === 'pending' && row.recipientId === user.id)
  const waitingOnRecipient = threadRows.some(row => row.status === 'pending' && row.senderId === user.id)
  const rejected = threadRows.some(row => row.status === 'rejected')
  const canCompose = Boolean(selectedContact) && (threadRows.length === 0 || connected)
  const chatCards = recentChats.slice()
  if (selectedContact && !chatCards.some(chat => chat.id === selectedContact.id)) {
    chatCards.unshift({ id: selectedContact.id, name: selectedContact.nameAr, photoKey: selectedContact.preferences?.profilePhotoKey, preview: 'ابدأ محادثة جديدة' })
  }
  const blockedUsers = blockedIds.length
    ? await db.select({ id: users.id, name: users.fullNameAr, email: users.email })
      .from(users).where(inArray(users.id, blockedIds)).orderBy(asc(users.fullNameAr))
    : []
  const resultMessage = params.result ? resultNotices[params.result] : undefined

  return <div className="messages-page page-stack">
    <section className="page-card card messages-chat-page">
      <div className="chat-page-heading">
        <div><span className="eyebrow">التواصل المدرسي</span><h1 className="page-title">الرسائل</h1><p className="page-subtitle">محادثات خاصة مع حسابات المدرسة.</p></div>
        <div className="quiet-icon"><MessageCircle size={21}/></div>
      </div>
      {resultMessage && <p className="message-notice" role="status">{resultMessage}</p>}

      <div className="chat-contact-tools">
        <form method="get" action="/messages" className="chat-contact-picker">
          <label htmlFor="chat-contact-select">محادثة مع</label>
          <select id="chat-contact-select" name="with" defaultValue={selectedId} required>
            <option value="" disabled>اختَر شخصًا من المدرسة</option>
            {contacts.map(contact => <option value={contact.id} key={contact.id}>{contact.nameAr} · {contact.role === 'teacher' ? 'مدرس' : contact.role === 'admin' ? 'إدارة' : 'طالب'}</option>)}
          </select>
          <button className="chat-open-button" type="submit" aria-label="فتح المحادثة" title="فتح المحادثة"><Plus size={18}/></button>
        </form>
        {chatCards.length > 0 && <nav className="chat-recent-list" aria-label="المحادثات الأخيرة">
          {chatCards.map(chat => <Link href={`/messages?with=${chat.id}`} key={chat.id} className={`chat-contact-chip${chat.id === selectedId ? ' active' : ''}`} aria-current={chat.id === selectedId ? 'page' : undefined}>
            <span className="chat-contact-avatar">{chat.photoKey ? <img src={photoUrl(chat.id, chat.photoKey)} alt=""/> : chat.name.slice(0, 1)}</span>
            <span className="chat-contact-label"><strong>{chat.name}</strong><small>{chat.preview}</small></span>
          </Link>)}
        </nav>}
      </div>

      {selectedContact ? <section className="chat-thread" aria-label={`محادثة مع ${selectedContact.nameAr}`}>
        <header className="chat-thread-header">
          <span className="chat-thread-avatar">{selectedContact.preferences?.profilePhotoKey ? <img src={photoUrl(selectedContact.id, selectedContact.preferences.profilePhotoKey)} alt=""/> : selectedContact.nameAr.slice(0, 1)}</span>
          <div><strong>{selectedContact.nameAr}</strong><small>{connected ? 'متصل بمحادثة خاصة' : 'تواصل مدرسي خاص'}</small></div>
          <form action={toggleBlockedUserAction} className="chat-block-form"><input type="hidden" name="userId" value={selectedContact.id}/><input type="hidden" name="intent" value="block"/><button className="chat-open-button chat-block-button" type="submit" aria-label="حظر الحساب" title="حظر الحساب"><Ban size={17}/></button></form>
        </header>

        <ChatHistory threadKey={`${selectedId}:${threadRows.length}:${threadRows[threadRows.length - 1]?.id ?? ''}`}>
          {threadRows.length ? threadRows.map(row => {
            const sentByMe = row.senderId === user.id
            return <article className={`chat-message ${sentByMe ? 'sent' : 'received'}`} key={row.id}>
              <div className="chat-bubble"><p>{row.body}</p><div className="chat-message-meta"><time dateTime={row.createdAt.toISOString()}>{row.createdAt.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</time>{sentByMe && row.status === 'pending' && <span>طلب تواصل</span>}{sentByMe && (row.status === 'accepted' || row.status === 'read') && <Check size={13} aria-label="تم الإرسال"/>}</div></div>
            </article>
          }) : <div className="chat-start-state"><MessageCircle size={24}/><p>ماكو رسائل بينكم بعد. اكتب أول رسالة وابدأ التواصل.</p></div>}
        </ChatHistory>

        {incomingPending.length > 0 && <div className="chat-request-card"><div><strong>طلب تواصل جديد</strong><p>اقبل الطلب حتى تقدرون تتبادلون الرسائل.</p></div>{incomingPending.map(row => <div className="chat-request-actions" key={row.id}>
          <form action={respondToMessageRequestAction}><input type="hidden" name="requestId" value={row.id}/><input type="hidden" name="conversationId" value={selectedContact.id}/><button className="button-primary" name="intent" value="accept" type="submit"><Check size={15}/> قبول</button></form>
          <form action={respondToMessageRequestAction}><input type="hidden" name="requestId" value={row.id}/><input type="hidden" name="conversationId" value={selectedContact.id}/><button className="quiet-danger" name="intent" value="reject" type="submit"><X size={15}/> رفض</button></form>
        </div>)}</div>}
        {!connected && waitingOnRecipient && incomingPending.length === 0 && <p className="chat-system-note">رسالتك وصلت. بانتظار قبول طلب التواصل.</p>}
        {!connected && rejected && <p className="chat-system-note">تم رفض طلب التواصل. ما تقدر ترسل رسائل جديدة لهذا الحساب.</p>}
        {canCompose && <form action={sendPrivateMessageAction} className="chat-composer">
          <input type="hidden" name="recipientId" value={selectedContact.id}/>
          <label className="sr-only" htmlFor="chat-message-input">اكتب رسالة</label>
          <textarea id="chat-message-input" name="body" rows={1} maxLength={3000} required placeholder="اكتب رسالة..." />
          <button className="chat-send-button" type="submit" aria-label="إرسال الرسالة" title="إرسال الرسالة"><Send size={19}/></button>
        </form>}
      </section> : <div className="chat-start-state chat-no-selection"><MessageCircle size={25}/><h2>ابدأ محادثة</h2><p>اختَر اسمًا من القائمة حتى تفتح محادثة خاصة.</p></div>}
    </section>

    <section className="blocked-panel card">
      <div className="section-header"><div><h2><UserRoundX size={18}/> المستخدمون المحظورون</h2><p>يمكنك إلغاء الحظر في أي وقت.</p></div><span className="count-note">{blockedUsers.length}</span></div>
      {blockedUsers.length ? blockedUsers.map(blocked => <div className="blocked-user-row" key={blocked.id}><span className="message-avatar muted-avatar">{blocked.name.slice(0, 1)}</span><div><strong>{blocked.name}</strong><small>{blocked.email}</small></div><form action={toggleBlockedUserAction}><input type="hidden" name="userId" value={blocked.id}/><input type="hidden" name="intent" value="unblock"/><button className="button-secondary" type="submit"><ShieldCheck size={15}/> إلغاء الحظر</button></form></div>) : <p className="quiet-empty"><UserRound size={18}/> لم تحظر أي مستخدم.</p>}
    </section>
  </div>
}
