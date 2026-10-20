'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

export async function toggleNotificationsMutedAction() {
  const user = await getCurrentUser()
  if (!user || !user.isActive) throw new Error('UNAUTHORIZED')
  const muted = Boolean(user.preferences?.notificationsMuted)
  await requireDb().update(users).set({
    preferences: { ...(user.preferences ?? {}), notificationsMuted: !muted },
    updatedAt: new Date(),
  }).where(eq(users.id, user.id))
  revalidatePath('/notifications')
  revalidatePath('/')
}
