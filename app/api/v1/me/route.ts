import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { apiError, apiJson, getApiSession, getSiteBaseUrl, readJson, safeUser } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول للوصول إلى بيانات الحساب.', 401)
  return apiJson({ user: safeUser(auth.user, getSiteBaseUrl(request)), expiresAt: auth.session.expiresAt })
}

export async function PATCH(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول أولًا.', 401)
  const input = await readJson(request)
  if (!input) return apiError('invalid_json', 'صيغة الطلب غير صالحة.', 400)
  const fullNameAr = String(input.fullNameAr ?? auth.user.fullNameAr).trim()
  const fullNameEn = String(input.fullNameEn ?? auth.user.fullNameEn).trim()
  const phone = String(input.phone ?? auth.user.phone ?? '').trim()
  if (fullNameAr.length < 3 || fullNameAr.length > 160 || fullNameEn.length < 2 || fullNameEn.length > 160 || phone.length > 40) return apiError('invalid_profile', 'تحقق من الاسم ورقم الهاتف.', 400)
  const preferences = { ...auth.user.preferences }
  if (typeof input.notificationsMuted === 'boolean') preferences.notificationsMuted = input.notificationsMuted
  if (input.appearance && typeof input.appearance === 'object') {
    const appearance = input.appearance as Record<string, unknown>
    const allowedFonts = ['noto-kufi-arabic', 'reem-kufi', 'amiri', 'el-messiri', 'cairo', 'tajawal', 'ibm-plex-sans-arabic', 'noto-sans-arabic']
    const fontFamily = String(appearance.fontFamily || 'ibm-plex-sans-arabic')
    const fontSize = Number(appearance.fontSize)
    const cardSize = String(appearance.cardSize || 'medium')
    if (!allowedFonts.includes(fontFamily) || !Number.isInteger(fontSize) || fontSize < 14 || fontSize > 24 || !['small', 'medium', 'large'].includes(cardSize)) return apiError('invalid_appearance', 'إعدادات المظهر غير صالحة.', 400)
    preferences.appearance = { fontFamily, fontSize, cardSize: cardSize as 'small' | 'medium' | 'large' }
  }
  const [updated] = await requireDb().update(users).set({ fullNameAr, fullNameEn, phone: phone || null, preferences, updatedAt: new Date() }).where(eq(users.id, auth.user.id)).returning()
  return apiJson({ user: safeUser(updated, getSiteBaseUrl(request)) })
}
