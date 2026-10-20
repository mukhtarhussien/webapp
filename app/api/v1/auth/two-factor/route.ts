import { createApiSession, apiError, apiJson, readJson, safeUser, verifyApiChallenge, getSiteBaseUrl } from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await readJson(request)
  const challengeToken = typeof body?.challengeToken === 'string' ? body.challengeToken : ''
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!challengeToken || !code || code.length > 64) return apiError('invalid_request', 'أدخل رمز التحقق.', 400)

  const result = await verifyApiChallenge(challengeToken, code)
  if (!result.ok) {
    return apiError(
      result.reason === 'invalid' ? 'invalid_code' : result.reason === 'locked' ? 'challenge_locked' : 'challenge_expired',
      result.reason === 'invalid' ? 'رمز التحقق غير صحيح.' : 'انتهت صلاحية طلب التحقق. سجّل الدخول مرة ثانية.',
      401,
      'attemptsRemaining' in result ? { attemptsRemaining: result.attemptsRemaining } : undefined,
    )
  }

  const session = await createApiSession(result.user.id)
  return apiJson({ accessToken: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: safeUser(result.user, getSiteBaseUrl(request)) })
}
