import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { getApiUser } from '@/lib/api/v1'
import { APP_STORAGE_BUCKET, getObjectStorageClient } from '@/lib/object-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const keyPattern = (userId: string) => new RegExp(`^avatars/${userId}/[0-9a-f-]{36}\\.jpg$`, 'i')

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

function isJpeg(bytes: Buffer) {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
}

export async function POST(request: Request) {
  const user = request.headers.has('authorization') ? await getApiUser(request) : await getCurrentUser()
  if (!user || !user.isActive) return jsonError('سجّل الدخول حتى ترفع صورة.', 401)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError('تعذر قراءة ملف الصورة.', 400)
  }

  const photo = form.get('photo')
  if (!(photo instanceof File) || photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) {
    return jsonError('حجم الصورة بعد ضغطها يجب ألا يتجاوز ٢ ميغابايت.', 400)
  }

  const bytes = Buffer.from(await photo.arrayBuffer())
  if (!isJpeg(bytes)) return jsonError('صيغة الصورة غير مدعومة.', 400)

  const objectKey = `avatars/${user.id}/${randomUUID()}.jpg`
  let storage: ReturnType<typeof getObjectStorageClient> | undefined
  try {
    storage = getObjectStorageClient()
    await storage.send(new PutObjectCommand({
      Bucket: APP_STORAGE_BUCKET,
      Key: objectKey,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: 'image/jpeg',
      CacheControl: 'private, max-age=86400',
      ContentDisposition: 'inline; filename="profile-photo.jpg"',
    }))
    await requireDb().update(users).set({
      preferences: { ...(user.preferences ?? {}), profilePhotoKey: objectKey },
      updatedAt: new Date(),
    }).where(eq(users.id, user.id))
  } catch {
    if (storage) {
      try { await storage.send(new DeleteObjectCommand({ Bucket: APP_STORAGE_BUCKET, Key: objectKey })) } catch { /* Keep the upload error response. */ }
    }
    return jsonError('تعذر حفظ الصورة. تحقق من إعداد التخزين وحاول مرة ثانية.', 503)
  }

  const previousKey = user.preferences?.profilePhotoKey
  if (previousKey && keyPattern(user.id).test(previousKey) && storage) {
    try { await storage.send(new DeleteObjectCommand({ Bucket: APP_STORAGE_BUCKET, Key: previousKey })) } catch { /* The saved profile photo already points to the new image. */ }
  }

  revalidatePath('/account')
  revalidatePath('/')
  revalidatePath('/messages')
  revalidatePath('/community')
  return NextResponse.json({ photoKey: objectKey }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request) {
  const user = request.headers.has('authorization') ? await getApiUser(request) : await getCurrentUser()
  if (!user || !user.isActive) return jsonError('سجّل الدخول حتى تعدّل الصورة.', 401)

  const currentKey = user.preferences?.profilePhotoKey
  const preferences = { ...(user.preferences ?? {}) }
  delete preferences.profilePhotoKey
  await requireDb().update(users).set({
    preferences,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id))

  if (currentKey && keyPattern(user.id).test(currentKey)) {
    try { await getObjectStorageClient().send(new DeleteObjectCommand({ Bucket: APP_STORAGE_BUCKET, Key: currentKey })) } catch { /* The profile has already been cleared. */ }
  }

  revalidatePath('/account')
  revalidatePath('/')
  revalidatePath('/messages')
  revalidatePath('/community')
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
