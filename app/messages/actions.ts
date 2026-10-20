'use server'

import { and, eq, inArray, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireDb } from '@/db'
import { messageRequests, users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

const value = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function sendPrivateMessageAction(fd: FormData) {
  const user = await getCurrentUser()
  if (!user || !user.isActive) redirect('/login')

  const recipientId = value(fd, 'recipientId')
  const subject = value(fd, 'subject')
  const body = value(fd, 'body')
  if (!uuidPattern.test(recipientId) || recipientId === user.id || !body || body.length > 3000 || subject.length > 180) {
    redirect('/messages?result=invalid')
  }

  const db = requireDb()
  const [recipient] = await db.select({ id: users.id, preferences: users.preferences })
    .from(users)
    .where(and(eq(users.id, recipientId), eq(users.isActive, true)))
    .limit(1)
  if (!recipient) redirect('/messages?result=unavailable')

  const senderBlockedIds = Array.isArray(user.preferences?.blockedUserIds) ? user.preferences.blockedUserIds : []
  const recipientBlockedIds = Array.isArray(recipient.preferences?.blockedUserIds) ? recipient.preferences.blockedUserIds : []
  if (senderBlockedIds.includes(recipientId) || recipientBlockedIds.includes(user.id)) {
    redirect('/messages?result=unavailable')
  }

  const relationship = or(
    and(eq(messageRequests.senderId, user.id), eq(messageRequests.recipientId, recipientId)),
    and(eq(messageRequests.senderId, recipientId), eq(messageRequests.recipientId, user.id)),
  )
  const [acceptedConversation] = await db.select({ id: messageRequests.id })
    .from(messageRequests)
    .where(and(relationship, inArray(messageRequests.status, ['accepted', 'read'])))
    .limit(1)

  if (!acceptedConversation) {
    const [declinedRequest] = await db.select({ id: messageRequests.id })
      .from(messageRequests)
      .where(and(
        eq(messageRequests.senderId, user.id),
        eq(messageRequests.recipientId, recipientId),
        eq(messageRequests.status, 'rejected'),
      ))
      .limit(1)
    if (declinedRequest) redirect('/messages?result=unavailable')
  }

  await db.insert(messageRequests).values({
    senderId: user.id,
    recipientId,
    subject: subject || null,
    body,
    status: acceptedConversation ? 'accepted' : 'pending',
  })

  revalidatePath('/messages')
  redirect(`/messages?with=${encodeURIComponent(recipientId)}&result=sent`)
}

export async function respondToMessageRequestAction(fd: FormData) {
  const user = await getCurrentUser()
  if (!user || !user.isActive) redirect('/login')

  const requestId = value(fd, 'requestId')
  const intent = value(fd, 'intent')
  const conversationId = value(fd, 'conversationId')
  if (!uuidPattern.test(requestId) || !uuidPattern.test(conversationId) || (intent !== 'accept' && intent !== 'reject')) {
    redirect('/messages?result=invalid')
  }

  await requireDb().update(messageRequests)
    .set({ status: intent === 'accept' ? 'accepted' : 'rejected' })
    .where(and(
      eq(messageRequests.id, requestId),
      eq(messageRequests.recipientId, user.id),
      eq(messageRequests.status, 'pending'),
    ))

  revalidatePath('/messages')
  redirect(`/messages?with=${encodeURIComponent(conversationId)}&result=${intent === 'accept' ? 'accepted' : 'rejected'}`)
}

export async function toggleBlockedUserAction(fd: FormData) {
  const user = await getCurrentUser()
  if (!user || !user.isActive) redirect('/login')
  const targetId = value(fd, 'userId')
  const intent = value(fd, 'intent')
  if (!uuidPattern.test(targetId) || targetId === user.id || (intent !== 'block' && intent !== 'unblock')) {
    redirect('/messages?result=invalid')
  }

  const db = requireDb()
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1)
  if (!target) redirect('/messages?result=unavailable')

  const current = Array.isArray(user.preferences?.blockedUserIds) ? user.preferences.blockedUserIds : []
  const next = intent === 'block'
    ? Array.from(new Set([...current, targetId]))
    : current.filter(id => id !== targetId)

  await db.update(users).set({
    preferences: { ...(user.preferences ?? {}), blockedUserIds: next },
    updatedAt: new Date(),
  }).where(eq(users.id, user.id))
  revalidatePath('/messages')
  revalidatePath('/account')
}
