import { and, asc, eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { assessments, grades, rules, schoolLocations } from '@/db/schema'
import { apiError, apiJson, getApiSession } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول للوصول إلى محتوى المدرسة.', 401)
  const db = requireDb()
  const [rulesRows, locations, assessmentRows] = await Promise.all([
    db.select({ id: rules.id, titleAr: rules.titleAr, titleEn: rules.titleEn, bodyAr: rules.bodyAr, bodyEn: rules.bodyEn, sortOrder: rules.sortOrder })
      .from(rules).where(eq(rules.published, true)).orderBy(asc(rules.sortOrder)),
    db.select({ id: schoolLocations.id, nameAr: schoolLocations.nameAr, nameEn: schoolLocations.nameEn, descriptionAr: schoolLocations.descriptionAr, descriptionEn: schoolLocations.descriptionEn, latitude: schoolLocations.latitude, longitude: schoolLocations.longitude, mapX: schoolLocations.mapX, mapY: schoolLocations.mapY, icon: schoolLocations.icon })
      .from(schoolLocations).orderBy(asc(schoolLocations.nameAr)),
    auth.user.role === 'student'
      ? db.select({ id: assessments.id, titleAr: assessments.titleAr, titleEn: assessments.titleEn, examOrder: assessments.examOrder, score: grades.score, maxScore: assessments.maxScore })
        .from(assessments).leftJoin(grades, and(eq(grades.assessmentId, assessments.id), eq(grades.studentId, auth.user.id)))
        .where(eq(assessments.published, true))
      : Promise.resolve([]),
  ])
  const grouped = new Map<string, { id: string; titleAr: string; titleEn: string; examOrder: number; scoreTotal: number; count: number }>()
  for (const row of assessmentRows) {
    if (!row.examOrder) continue
    const item = grouped.get(row.id) ?? { id: row.id, titleAr: row.titleAr, titleEn: row.titleEn, examOrder: row.examOrder, scoreTotal: 0, count: 0 }
    if (row.score !== null && row.maxScore > 0) { item.scoreTotal += row.score / row.maxScore * 100; item.count++ }
    grouped.set(row.id, item)
  }
  return apiJson({ rules: rulesRows, locations, progress: [...grouped.values()].map(row => ({ id: row.id, titleAr: row.titleAr, titleEn: row.titleEn, examOrder: row.examOrder, average: row.count ? row.scoreTotal / row.count : 0 })) })
}
