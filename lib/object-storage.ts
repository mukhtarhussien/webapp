import 'server-only'
import { S3Client } from '@aws-sdk/client-s3'

export const APP_STORAGE_BUCKET = 'uploads'
export const APK_CONTENT_TYPE = 'application/vnd.android.package-archive'

export function getObjectStorageClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const region = process.env.AWS_REGION || 'eu-central-1'
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Object Storage is not configured. Set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION.')
  }
  return new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
}
