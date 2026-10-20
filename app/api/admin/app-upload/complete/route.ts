import { NextResponse } from 'next/server'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { sql } from 'drizzle-orm'
import { requireDb } from '@/db'
import { siteSettings } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { APP_STORAGE_BUCKET, getObjectStorageClient } from '@/lib/object-storage'

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
  const objectKey = typeof input.objectKey === 'string' ? input.objectKey : ''
  const fileName = (typeof input.fileName === 'string' ? input.fileName : '')
    .trim().replace(/[\r\n"\\/]/g, '_').slice(0, 140)
  const sizeBytes = Number(input.sizeBytes)
  const version = typeof input.version === 'string' ? input.version.trim() : ''
  if (!/^app-releases\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.apk$/i.test(objectKey)) {
    return NextResponse.json({ error: 'مفتاح التخزين غير صالح.' }, { status: 400 })
  }
  if (!fileName.toLowerCase().endsWith('.apk') || !version || version.length > 40 || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 200 * 1024 * 1024) {
    return NextResponse.json({ error: 'بيانات الإصدار غير مكتملة أو تتجاوز الحجم المسموح.' }, { status: 400 })
  }

  try {
    const client = getObjectStorageClient()
    const head = await client.send(new HeadObjectCommand({ Bucket: APP_STORAGE_BUCKET, Key: objectKey }))
    if (head.ContentLength !== sizeBytes) {
      return NextResponse.json({ error: 'حجم الملف المستلم لا يطابق الملف المحدد.' }, { status: 400 })
    }

    const now = new Date()
    await requireDb().insert(siteSettings).values([
      { key: 'mobile_app_object_key', value: { value: objectKey }, updatedAt: now },
      { key: 'mobile_app_filename', value: { value: fileName }, updatedAt: now },
      { key: 'mobile_app_version', value: { value: version }, updatedAt: now },
      { key: 'mobile_app_size_bytes', value: { value: String(sizeBytes) }, updatedAt: now },
    ]).onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
    })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'تعذر التحقق من الملف أو حفظ الإصدار.' }, { status: 500 })
  }
}
