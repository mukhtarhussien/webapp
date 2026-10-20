import { apiJson, API_VERSION } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'

export async function GET() {
  return apiJson({
    name: 'School Platform API',
    version: API_VERSION,
    endpoints: {
      bootstrap: '/api/v1/bootstrap',
      login: '/api/v1/auth/login',
      googleLogin: '/api/v1/auth/google',
      flutterSession: '/api/auth/flutter-session',
      twoFactor: '/api/v1/auth/two-factor',
      me: '/api/v1/me',
      dashboard: '/api/v1/dashboard',
      assets: '/api/v1/assets',
      content: '/api/v1/content',
      community: '/api/v1/community',
      messages: '/api/v1/messages',
      notifications: '/api/v1/notifications',
      admin: '/api/v1/admin',
      registration: '/api/v1/register',
      logout: '/api/v1/auth/logout',
    },
    authentication: 'Bearer token',
    documentation: 'https://github.com/mukhtarhussien/school-platform/blob/main/docs/flutter-api.md',
  })
}
