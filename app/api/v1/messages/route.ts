import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { requireDb } from '@/db'
import { messageRequests, users } from '@/db/schema'
import { apiError, apiJson, getApiSession, getSiteBaseUrl, readJson } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول للرسائل.', 401)
  const db = requireDb()
  const sender = alias(users, 'api_message_sender')
  const recipient = alias(users, 'api_message_recipient')
  const [contacts, messages] = await Promise.all([
    db.select({ id: users.id, name: users.fullNameAr, role: users.role, preferences: users.preferences })
      .from(users).where(eq(users.isActive, true)).orderBy(asc(users.fullNameAr)),
    db.select({ id: messageRequests.id, senderId: messageRequests.senderId, recipientId: messageRequests.recipientId, body: messageRequests.body, subject: messageRequests.subject, status: messageRequests.status, createdAt: messageRequests.createdAt, senderName: sender.fullNameAr, senderPhotoKey: sender.preferences, recipientName: recipient.fullNameAr, recipientPhotoKey: recipient.preferences })
      .from(messageRequests).innerJoin(sender, eq(sender.id, messageRequests.senderId)).innerJoin(recipient, eq(recipient.id, messageRequests.recipientId))
      .where(or(eq(messageRequests.senderId, auth.user.id), eq(messageRequests.recipientId, auth.user.id))).orderBy(desc(messageRequests.createdAt)).limit(200),
  ])
  const blockedIds = Array.isArray(auth.user.preferences?.blockedUserIds) ? auth.user.preferences.blockedUserIds : []
  const unavailableIds = new Set([...blockedIds, ...contacts.filter(contact => Array.isArray(contact.preferences?.blockedUserIds) && contact.preferences!.blockedUserIds!.includes(auth.user.id)).map(contact => contact.id)])
  const visibleContacts = contacts.filter(contact => contact.id !== auth.user.id && !unavailableIds.has(contact.id))
  const visibleMessages = messages.filter(row => !unavailableIds.has(row.senderId === auth.user.id ? row.recipientId : row.senderId)).map(row => ({
    ...row,
    senderPhotoUrl: row.senderPhotoKey?.profilePhotoKey ? getSiteBaseUrl(request) + '/api/profile-photo/' + row.senderId + '?v=' + encodeURIComponent(row.senderPhotoKey.profilePhotoKey || '') : null,
    recipientPhotoUrl: row.recipientPhotoKey?.profilePhotoKey ? getSiteBaseUrl(request) + '/api/profile-photo/' + row.recipientId + '?v=' + encodeURIComponent(row.recipientPhotoKey.profilePhotoKey || '') : null,
  }))
  const blockedUsers = contacts.filter(contact => blockedIds.includes(contact.id)).map(({ id, name, role }) => ({ id, name, role }))
  return apiJson({ currentUserId: auth.user.id, contacts: visibleContacts.map(({ id, name, role, preferences }) => ({ id, name, role, photoUrl: preferences?.profilePhotoKey ? getSiteBaseUrl(request) + '/api/profile-photo/' + id + '?v=' + encodeURIComponent(preferences?.profilePhotoKey || '') : null })), messages: visibleMessages, blockedIds, blockedUsers })
}

export async function POST(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول أولًا.', 401)
  const input = await readJson(request)
  if (!input) return apiError('invalid_json', 'صيغة الطلب غير صالحة.', 400)
  const db = requireDb()
  const action = String(input.action || '')
  if (action === 'send') {
    const recipientId = String(input.recipientId || '')
    const body = String(input.body || '').trim()
    const subject = String(input.subject || '').trim()
    if (!uuidPattern.test(recipientId) || recipientId === auth.user.id || !body || body.length > 3000 || subject.length > 180) return apiError('invalid_message', 'تحقق من محتوى الرسالة.', 400)
    const [recipient] = await db.select({ id: users.id, preferences: users.preferences }).from(users).where(and(eq(users.id, recipientId), eq(users.isActive, true))).limit(1)
    if (!recipient) return apiError('unavailable', 'هذا الحساب غير متاح للتواصل.', 404)
    const senderBlockedIds = Array.isArray(auth.user.preferences?.blockedUserIds) ? auth.user.preferences.blockedUserIds : []
    const recipientBlockedIds = Array.isArray(recipient.preferences?.blockedUserIds) ? recipient.preferences.blockedUserIds : []
    if (senderBlockedIds.includes(recipientId) || recipientBlockedIds.includes(auth.user.id)) return apiError('unavailable', 'هذا الحساب غير متاح للتواصل.', 403)
    const relation = or(and(eq(messageRequests.senderId, auth.user.id), eq(messageRequests.recipientId, recipientId)), and(eq(messageRequests.senderId, recipientId), eq(messageRequests.recipientId, auth.user.id)))
    const [accepted] = await db.select({ id: messageRequests.id }).from(messageRequests).where(and(relation, inArray(messageRequests.status, ['accepted', 'read'] as const))).limit(1)
    if (!accepted) {
      const [rejected] = await db.select({ id: messageRequests.id }).from(messageRequests).where(and(eq(messageRequests.senderId, auth.user.id), eq(messageRequests.recipientId, recipientId), eq(messageRequests.status, 'rejected'))).limit(1)
      if (rejected) return apiError('unavailable', 'تم رفض طلب التواصل لهذا الحساب.', 403)
    }
    const [created] = await db.insert(messageRequests).values({ senderId: auth.user.id, recipientId, subject: subject || null, body, status: accepted ? 'accepted' : 'pending' }).returning({ id: messageRequests.id })
    return apiJson({ id: created.id }, 201)
  }
  if (action === 'respond') {
    const requestId = String(input.requestId || '')
    const intent = String(input.intent || '')
    if (!uuidPattern.test(requestId) || !['accept', 'reject'].includes(intent)) return apiError('invalid_request', 'طلب التواصل غير صالح.', 400)
    const [updated] = await db.update(messageRequests).set({ status: intent === 'accept' ? 'accepted' : 'rejected' }).where(and(eq(messageRequests.id, requestId), eq(messageRequests.recipientId, auth.user.id), eq(messageRequests.status, 'pending'))).returning({ id: messageRequests.id })
    if (!updated) return apiError('not_found', 'طلب التواصل غير موجود أو تمت معالجته.', 404)
    return apiJson({ saved: true })
  }
  if (action === 'block' || action === 'unblock') {
    const userId = String(input.userId || '')
    if (!uuidPattern.test(userId) || userId === auth.user.id) return apiError('invalid_user', 'الحساب غير صالح.', 400)
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    if (!target) return apiError('not_found', 'الحساب غير موجود.', 404)
    const current = Array.isArray(auth.user.preferences?.blockedUserIds) ? auth.user.preferences.blockedUserIds : []
    const next = action === 'block' ? Array.from(new Set([...current, userId])) : current.filter(id => id !== userId)
    await db.update(users).set({ preferences: { ...auth.user.preferences, blockedUserIds: next }, updatedAt: new Date() }).where(eq(users.id, auth.user.id))
    return apiJson({ blockedIds: next })
  }
  return apiError('invalid_action', 'الإجراء غير معروف.', 400)
}
