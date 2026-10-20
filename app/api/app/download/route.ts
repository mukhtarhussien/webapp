import { NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { siteSettings } from '@/db/schema'
import { APP_STORAGE_BUCKET, getObjectStorageClient } from '@/lib/object-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await requireDb().select().from(siteSettings).where(eq(siteSettings.key, 'mobile_app_object_key')).limit(1)
    const objectKey = String((rows[0]?.value as { value?: string } | undefined)?.value ?? '')
    const nameRows = await requireDb().select().from(siteSettings).where(eq(siteSettings.key, 'mobile_app_filename')).limit(1)
    const fileName = String((nameRows[0]?.value as { value?: string } | undefined)?.value ?? 'school-portal.apk').replace(/[\r\n"\\/]/g, '_').slice(0, 140)
    if (!objectKey.startsWith('app-releases/') || !objectKey.endsWith('.apk')) {
      return new NextResponse('لم تنشر إدارة المدرسة تطبيقًا للتنزيل بعد.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    const client = getObjectStorageClient()
    const url = await getSignedUrl(client, new GetObjectCommand({
      Bucket: APP_STORAGE_BUCKET,
      Key: objectKey,
      ResponseContentType: 'application/vnd.android.package-archive',
      ResponseContentDisposition: 'attachment; filename="' + fileName + '"',
    }), { expiresIn: 180 })
    return NextResponse.redirect(url, { status: 302 })
  } catch {
    return new NextResponse('خدمة تنزيل التطبيق غير مهيأة. راجع إعدادات التخزين في Vercel.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
