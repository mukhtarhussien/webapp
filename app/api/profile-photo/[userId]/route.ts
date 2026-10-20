import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireDb } from '@/db'
import { users } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { getApiUser } from '@/lib/api/v1'
import { APP_STORAGE_BUCKET, getObjectStorageClient } from '@/lib/object-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const viewer = request.headers.has('authorization') ? await getApiUser(request) : await getCurrentUser()
  if (!viewer || !viewer.isActive) return new NextResponse(null, { status: 401 })

  const { userId } = await params
  if (!uuidPattern.test(userId)) return new NextResponse(null, { status: 404 })

  const [profile] = await requireDb().select({ preferences: users.preferences })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isActive, true)))
    .limit(1)
  const objectKey = profile?.preferences?.profilePhotoKey
  if (!objectKey || !new RegExp(`^avatars/${userId}/[0-9a-f-]{36}\\.jpg$`, 'i').test(objectKey)) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const signedUrl = await getSignedUrl(getObjectStorageClient(), new GetObjectCommand({
      Bucket: APP_STORAGE_BUCKET,
      Key: objectKey,
      ResponseContentType: 'image/jpeg',
      ResponseContentDisposition: 'inline',
    }), { expiresIn: 300 })
    return NextResponse.redirect(signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
