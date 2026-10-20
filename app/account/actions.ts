'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

const value = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()

export async function saveAccountAction(fd: FormData) {
  const user = await getCurrentUser()
  if (!user || !user.isActive) throw new Error('UNAUTHORIZED')
  const fullNameAr = value(fd, 'fullNameAr')
  const fullNameEn = value(fd, 'fullNameEn')
  const phone = value(fd, 'phone')
  if (fullNameAr.length < 3 || fullNameAr.length > 160) throw new Error('INVALID_NAME')
  if (fullNameEn.length < 2 || fullNameEn.length > 160) throw new Error('INVALID_NAME_EN')
  if (phone.length > 40) throw new Error('INVALID_PHONE')

  await requireDb().update(users).set({
    fullNameAr,
    fullNameEn,
    phone: phone || null,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id))

  revalidatePath('/account')
  revalidatePath('/')
  revalidatePath('/messages')
}

import {
  isAppearanceFontFamily,
  normalizeCardSize,
  normalizeFontSize,
  type AppearanceFontFamily,
  type CardSize,
} from '@/lib/appearance'

export async function saveAppearanceAction(input: {
  fontFamily: AppearanceFontFamily
  fontSize: number
  cardSize: CardSize
}) {
  const user = await getCurrentUser()

  if (!user || !user.isActive) {
    throw new Error('UNAUTHORIZED')
  }

  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_APPEARANCE')
  }

  const { fontFamily, fontSize, cardSize } = input

  if (!isAppearanceFontFamily(fontFamily)) {
    throw new Error('INVALID_FONT')
  }

  if (!Number.isInteger(fontSize) || fontSize < 14 || fontSize > 24) {
    throw new Error('INVALID_FONT_SIZE')
  }

  if (!['small', 'medium', 'large'].includes(cardSize)) {
    throw new Error('INVALID_CARD_SIZE')
  }

  const db = requireDb()

  const preferences = {
    ...(user.preferences ?? {}),
    appearance: {
      fontFamily,
      fontSize: normalizeFontSize(fontSize),
      cardSize: normalizeCardSize(cardSize),
    },
  }

  await db
    .update(users)
    .set({
      preferences: preferences as typeof users.$inferInsert.preferences,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  revalidatePath('/account')
}
