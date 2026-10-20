import { desc, eq, inArray, or } from 'drizzle-orm'
import { requireDb } from '@/db'
import { files, siteSettings } from '@/db/schema'
import { apiError, apiJson, getApiSession, getSiteBaseUrl } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'

function assetUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && new URL(baseUrl).protocol === 'http:')) return null
    return url.toString()
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول للوصول إلى ملفات المدرسة.', 401)

  const user = auth.user
  const db = requireDb()
  const baseUrl = getSiteBaseUrl(request)
  const [fileRows, settingRows] = await Promise.all([
    db.select({
      id: files.id,
      name: files.name,
      url: files.url,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      folder: files.folder,
      visibility: files.visibility,
      createdAt: files.createdAt,
      ownerId: files.ownerId,
    }).from(files).where(or(
      eq(files.ownerId, user.id),
      inArrayVisibility(user.role),
    )).orderBy(desc(files.createdAt)).limit(100),
    db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'portal_logo_url')).limit(1),
  ])

  const logoValue = settingRows[0]?.value
  const logo = logoValue && typeof logoValue === 'object' && 'value' in logoValue
    ? assetUrl(String((logoValue as { value: unknown }).value || ''), baseUrl)
    : null

  const assets = fileRows.map(file => ({
    id: file.id,
    type: 'file',
    name: file.name,
    url: assetUrl(file.url, baseUrl),
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    folder: file.folder,
    visibility: file.visibility,
    createdAt: file.createdAt,
    isOwnedByCurrentUser: file.ownerId === user.id,
  })).filter(file => file.url)

  return apiJson({
    baseUrl,
    assets: [
      ...(logo ? [{ id: 'portal-logo', type: 'image', name: 'شعار المدرسة', url: logo, mimeType: 'image/*' }] : []),
      ...(user.preferences?.profilePhotoKey ? [{
        id: 'my-profile-photo',
        type: 'image',
        name: 'الصورة الشخصية',
        url: baseUrl + '/api/profile-photo/' + user.id,
        mimeType: 'image/jpeg',
        requiresBearerToken: true,
      }] : []),
      ...assets,
    ],
  })
}

function inArrayVisibility(role: 'student' | 'teacher' | 'admin') {
  const audience: 'students' | 'teachers' | 'admins' = role === 'student' ? 'students' : role === 'teacher' ? 'teachers' : 'admins'
  return or(eq(files.visibility, 'all'), eq(files.visibility, audience))
}
