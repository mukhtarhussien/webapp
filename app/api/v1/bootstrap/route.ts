import { inArray } from 'drizzle-orm'
import { requireDb } from '@/db'
import { siteSettings } from '@/db/schema'
import { apiJson, getSiteBaseUrl } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'

const publicKeys = [
  'portal_name_ar',
  'portal_name_en',
  'portal_tagline_ar',
  'portal_tagline_en',
  'portal_logo_url',
]

function settingValue(value: unknown) {
  if (value && typeof value === 'object' && 'value' in value) return String((value as { value: unknown }).value ?? '')
  return typeof value === 'string' ? value : ''
}

function publicAssetUrl(value: string, baseUrl: string) {
  if (!value) return null
  try {
    const url = new URL(value, baseUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && new URL(baseUrl).protocol === 'http:')) return null
    return url.toString()
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const baseUrl = getSiteBaseUrl(request)
  const rows = await requireDb().select().from(siteSettings).where(inArray(siteSettings.key, publicKeys))
  const settings = new Map(rows.map(row => [row.key, settingValue(row.value)]))
  return apiJson({
    site: {
      id: 'school-platform',
      name: {
        ar: settings.get('portal_name_ar') || 'بوابة المدرسة',
        en: settings.get('portal_name_en') || 'School Portal',
      },
      tagline: {
        ar: settings.get('portal_tagline_ar') || '',
        en: settings.get('portal_tagline_en') || '',
      },
      baseUrl,
      locale: { default: 'ar', supported: ['ar', 'en'], direction: { ar: 'rtl', en: 'ltr' } },
    },
    app: {
      id: 'school-platform-flutter',
      platform: 'flutter',
      apiVersion: '1',
      name: { ar: 'مدرستي', en: 'School App' },
      defaultLanguage: 'ar',
      theme: {
        primary: '#14233D',
        accent: '#B39154',
        background: '#F2F4F8',
        surface: '#FCFDFE',
        text: '#171B25',
      },
    },
    assets: {
      logo: publicAssetUrl(settings.get('portal_logo_url') || '', baseUrl),
      profilePhotoTemplate: baseUrl + '/api/profile-photo/{userId}',
      filesEndpoint: baseUrl + '/api/v1/assets',
    },
    endpoints: {
      login: baseUrl + '/api/v1/auth/login',
      googleLogin: baseUrl + '/api/v1/auth/google',
      flutterSession: baseUrl + '/api/auth/flutter-session',
      twoFactor: baseUrl + '/api/v1/auth/two-factor',
      me: baseUrl + '/api/v1/me',
      dashboard: baseUrl + '/api/v1/dashboard',
      assets: baseUrl + '/api/v1/assets',
      content: baseUrl + '/api/v1/content',
      community: baseUrl + '/api/v1/community',
      messages: baseUrl + '/api/v1/messages',
      notifications: baseUrl + '/api/v1/notifications',
      admin: baseUrl + '/api/v1/admin',
      registration: baseUrl + '/api/v1/register',
      logout: baseUrl + '/api/v1/auth/logout',
    },
  })
}
