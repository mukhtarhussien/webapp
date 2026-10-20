import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getCurrentUser } from '@/lib/auth'
import { APP_STORAGE_BUCKET, APK_CONTENT_TYPE, getObjectStorageClient } from '@/lib/object-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || !user.isActive || user.role !== 'admin' || !user.twoFactorEnabled) {
    return NextResponse.json({ error: 'هذه العملية متاحة للإدارة بعد تفعيل المصادقة الثنائية.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب ليست JSON صالحًا.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة.' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const fileName = typeof input.fileName === 'string' ? input.fileName.trim() : ''
  const sizeBytes = Number(input.sizeBytes)
  const version = typeof input.version === 'string' ? input.version.trim() : ''
  if (!fileName || fileName.length > 255 || !fileName.toLowerCase().endsWith('.apk')) {
    return NextResponse.json({ error: 'يُسمح بملفات APK فقط.' }, { status: 400 })
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 200 * 1024 * 1024) {
    return NextResponse.json({ error: 'حجم التطبيق يجب أن يكون أقل من 200 ميغابايت.' }, { status: 400 })
  }
  if (!version || version.length > 40) {
    return NextResponse.json({ error: 'رقم الإصدار غير صالح.' }, { status: 400 })
  }

  try {
    const objectKey = 'app-releases/' + randomUUID() + '.apk'
    const client = getObjectStorageClient()
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: APP_STORAGE_BUCKET, Key: objectKey, ContentType: APK_CONTENT_TYPE }), { expiresIn: 900 })
    return NextResponse.json({ uploadUrl, objectKey, contentType: APK_CONTENT_TYPE }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'تعذر تجهيز رابط الرفع. تحقق من إعدادات التخزين.' }, { status: 500 })
  }
}
