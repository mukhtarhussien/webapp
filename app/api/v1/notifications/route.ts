import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { apiError, apiJson, getApiSession, readJson } from '@/lib/api/v1'

export async function PATCH(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول أولًا.', 401)
  const body = await readJson(request)
  if (typeof body?.muted !== 'boolean') return apiError('invalid_preference', 'قيمة الإشعارات غير صالحة.', 400)
  const preferences = { ...auth.user.preferences, notificationsMuted: body.muted }
  await requireDb().update(users).set({ preferences, updatedAt: new Date() }).where(eq(users.id, auth.user.id))
  return apiJson({ muted: body.muted })
}
