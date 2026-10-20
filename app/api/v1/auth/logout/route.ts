import { apiError, apiJson, getApiSession, revokeApiSession } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await getApiSession(request))) return apiError('unauthorized', 'الجلسة غير صالحة أو انتهت.', 401)
  await revokeApiSession(request)
  return apiJson({ signedOut: true })
}
