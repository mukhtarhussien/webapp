import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { requireDb } from '@/db'
import {
  announcements,
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  calendarEvents,
  classes,
  grades,
  assessments,
  notifications,
  subjects,
} from '@/db/schema'
import { apiError, apiJson, getApiSession, getSiteBaseUrl, safeUser } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول للوصول إلى لوحة التطبيق.', 401)

  const user = auth.user
  const db = requireDb()
  const missingClass = '00000000-0000-0000-0000-000000000000'
  const classId = user.classId || missingClass
  const audienceForRole = user.role === 'student' ? 'students' : user.role === 'teacher' ? 'teachers' : 'admins'

  const [classRows, announcementRows, eventRows, notificationRows] = await Promise.all([
    user.classId
      ? db.select({ id: classes.id, nameAr: classes.nameAr, nameEn: classes.nameEn, gradeLevel: classes.gradeLevel, section: classes.section, room: classes.room }).from(classes).where(eq(classes.id, user.classId)).limit(1)
      : Promise.resolve([]),
    db.select({
      id: announcements.id,
      titleAr: announcements.titleAr,
      titleEn: announcements.titleEn,
      bodyAr: announcements.bodyAr,
      bodyEn: announcements.bodyEn,
      audience: announcements.audience,
      publishedAt: announcements.publishedAt,
    }).from(announcements).where(and(
      eq(announcements.published, true),
      or(
        inArray(announcements.audience, ['all', audienceForRole]),
        and(eq(announcements.audience, 'class'), eq(announcements.classId, classId)),
      ),
    )).orderBy(desc(announcements.publishedAt)).limit(20),
    db.select({
      id: calendarEvents.id,
      titleAr: calendarEvents.titleAr,
      titleEn: calendarEvents.titleEn,
      descriptionAr: calendarEvents.descriptionAr,
      descriptionEn: calendarEvents.descriptionEn,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      location: calendarEvents.location,
      classId: calendarEvents.classId,
    }).from(calendarEvents).where(or(
      sql`${calendarEvents.classId} is null`,
      eq(calendarEvents.classId, classId),
    )).orderBy(calendarEvents.startsAt).limit(40),
    db.select({
      id: notifications.id,
      titleAr: notifications.titleAr,
      titleEn: notifications.titleEn,
      bodyAr: notifications.bodyAr,
      bodyEn: notifications.bodyEn,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    }).from(notifications).where(or(
      eq(notifications.userId, user.id),
      sql`${notifications.userId} is null`,
    )).orderBy(desc(notifications.createdAt)).limit(30),
  ])

  let gradeRows: Array<{
    id: string
    assessment: string
    assessmentEn: string
    type: string
    examOrder: number | null
    subjectAr: string
    subjectEn: string
    score: number
    maxScore: number
    feedback: string | null
    gradedAt: Date
  }> = []
  let assignmentRows: Array<{
    id: string
    titleAr: string
    titleEn: string
    descriptionAr: string | null
    descriptionEn: string | null
    subjectAr: string
    subjectEn: string
    dueAt: Date
    maxScore: number
    submissionAt: Date | null
    submissionScore: number | null
    submissionFeedback: string | null
  }> = []
  let attendanceRows: Array<{ date: Date; status: string; note: string | null }> = []

  if (user.role === 'student') {
    const [gradesResult, assignmentsResult, attendanceResult] = await Promise.all([
      db.select({
        id: grades.id,
        assessment: assessments.titleAr,
        assessmentEn: assessments.titleEn,
        type: assessments.type,
        examOrder: assessments.examOrder,
        subjectAr: subjects.nameAr,
        subjectEn: subjects.nameEn,
        score: grades.score,
        maxScore: assessments.maxScore,
        feedback: grades.feedback,
        gradedAt: grades.gradedAt,
      }).from(grades)
        .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
        .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
        .where(and(eq(grades.studentId, user.id), eq(assessments.published, true)))
        .orderBy(desc(grades.gradedAt))
        .limit(50),
      db.select({
        id: assignments.id,
        titleAr: assignments.titleAr,
        titleEn: assignments.titleEn,
        descriptionAr: assignments.descriptionAr,
        descriptionEn: assignments.descriptionEn,
        subjectAr: subjects.nameAr,
        subjectEn: subjects.nameEn,
        dueAt: assignments.dueAt,
        maxScore: assignments.maxScore,
        submissionAt: assignmentSubmissions.submittedAt,
        submissionScore: assignmentSubmissions.score,
        submissionFeedback: assignmentSubmissions.feedback,
      }).from(assignments)
        .innerJoin(subjects, eq(subjects.id, assignments.subjectId))
        .leftJoin(assignmentSubmissions, and(
          eq(assignmentSubmissions.assignmentId, assignments.id),
          eq(assignmentSubmissions.studentId, user.id),
        ))
        .where(and(eq(assignments.published, true), eq(assignments.classId, classId)))
        .orderBy(assignments.dueAt)
        .limit(50),
      db.select({
        date: attendanceRecords.date,
        status: attendanceRecords.status,
        note: attendanceRecords.note,
      }).from(attendanceRecords)
        .where(eq(attendanceRecords.studentId, user.id))
        .orderBy(desc(attendanceRecords.date))
        .limit(30),
    ])
    gradeRows = gradesResult
    assignmentRows = assignmentsResult
    attendanceRows = attendanceResult
  }

  const scored = gradeRows.filter(row => row.maxScore > 0)
  const gradeAverage = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + row.score / row.maxScore * 100, 0) / scored.length * 10) / 10
    : null

  return apiJson({
    user: safeUser(user, getSiteBaseUrl(request)),
    class: classRows[0] || null,
    summary: {
      gradeAverage,
      publishedGrades: gradeRows.length,
      assignments: assignmentRows.length,
      unreadNotifications: notificationRows.filter(row => !row.readAt).length,
      attendanceRecords: attendanceRows.length,
    },
    grades: gradeRows,
    announcements: announcementRows,
    assignments: assignmentRows,
    calendarEvents: eventRows,
    notifications: notificationRows,
    attendance: attendanceRows,
    assets: {
      profilePhoto: user.preferences?.profilePhotoKey ? getSiteBaseUrl(request) + '/api/profile-photo/' + user.id : null,
      site: '/api/v1/bootstrap',
      files: '/api/v1/assets',
    },
    sessionExpiresAt: auth.session.expiresAt,
  })
}
