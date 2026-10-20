import crypto from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { requireDb } from '@/db'
import {
  announcements, assessments, assignments, attendanceRecords, calendarEvents, classes,
  communityPosts, files, grades, notifications, registrationRequests, rules,
  schoolLocations, siteSettings, subjects, teachers, teachingAssignments, users,
} from '@/db/schema'
import { hashPassword } from '@/lib/auth'
import { apiError, apiJson, getApiSession, readJson } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'
const str = (body: Record<string, unknown>, key: string) => String(body[key] ?? '').trim()
const num = (body: Record<string, unknown>, key: string, fallback = 0) => Number.isFinite(Number(body[key])) ? Number(body[key]) : fallback
const date = (body: Record<string, unknown>, key: string) => { const value = str(body, key); const parsed = value ? new Date(value) : null; return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null }
const count = async (table: any) => (await requireDb().select({ value: sql<number>`count(*)::int` }).from(table))[0]?.value ?? 0

async function adminSession(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return { error: apiError('unauthorized', 'سجّل الدخول أولًا.', 401) }
  if (auth.user.role !== 'admin') return { error: apiError('forbidden', 'هذه الصفحة متاحة للإدارة فقط.', 403) }
  return { auth }
}

export async function GET(request: Request) {
  const gate = await adminSession(request)
  if (gate.error) return gate.error
  const db = requireDb()
  const [stats, recentUsers, classRows, subjectRows, students, teacherRows, assessmentRows, pendingRegistrations, postRows, announcementRows] = await Promise.all([
    Promise.all([
      Promise.all([users, teachers, classes, subjects, assessments, grades, assignments, announcements, calendarEvents, files, notifications, communityPosts, rules, attendanceRecords, schoolLocations].map(count)),
      db.select({ value: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'student')).then(rows => rows[0]?.value ?? 0),
    ]),
    db.select({ id: users.id, name: users.fullNameAr, email: users.email, role: users.role, active: users.isActive }).from(users).orderBy(desc(users.createdAt)).limit(25),
    db.select({ id: classes.id, nameAr: classes.nameAr, nameEn: classes.nameEn, gradeLevel: classes.gradeLevel, section: classes.section }).from(classes).orderBy(desc(classes.createdAt)).limit(100),
    db.select({ id: subjects.id, code: subjects.code, nameAr: subjects.nameAr, nameEn: subjects.nameEn }).from(subjects).orderBy(desc(subjects.createdAt)).limit(100),
    db.select({ id: users.id, name: users.fullNameAr, email: users.email, studentNumber: users.studentNumber, classId: users.classId, active: users.isActive }).from(users).where(eq(users.role, 'student')).orderBy(users.fullNameAr).limit(500),
    db.select({ id: teachers.id, userId: teachers.userId, name: users.fullNameAr, code: teachers.employeeCode }).from(teachers).innerJoin(users, eq(users.id, teachers.userId)).orderBy(users.fullNameAr).limit(300),
    db.select({ id: assessments.id, title: assessments.titleAr, maxScore: assessments.maxScore, examOrder: assessments.examOrder, subjectId: assessments.subjectId, classId: assessments.classId, published: assessments.published }).from(assessments).orderBy(desc(assessments.createdAt)).limit(100),
    db.select({ id: registrationRequests.id, email: registrationRequests.email, username: registrationRequests.username, requestedRole: registrationRequests.requestedRole, name: registrationRequests.fullName, googleName: registrationRequests.googleName, phone: registrationRequests.phone, birthDate: registrationRequests.birthDate, classId: registrationRequests.classId, subjectId: registrationRequests.subjectId, createdAt: registrationRequests.createdAt }).from(registrationRequests).where(eq(registrationRequests.status, 'pending')).orderBy(desc(registrationRequests.createdAt)).limit(100),
    db.select({ id: communityPosts.id, body: communityPosts.body, published: communityPosts.published, pinned: communityPosts.pinned, author: users.fullNameAr }).from(communityPosts).innerJoin(users, eq(users.id, communityPosts.authorId)).orderBy(desc(communityPosts.createdAt)).limit(40),
    db.select({ id: announcements.id, titleAr: announcements.titleAr, published: announcements.published, createdAt: announcements.createdAt }).from(announcements).orderBy(desc(announcements.createdAt)).limit(30),
  ])
  const counts = stats[0]
  return apiJson({ stats: { users: counts[0], teachers: counts[1], students: stats[1], classes: counts[2], subjects: counts[3], assessments: counts[4], grades: counts[5], assignments: counts[6], announcements: counts[7], events: counts[8], files: counts[9], notifications: counts[10], posts: counts[11], rules: counts[12], attendance: counts[13], locations: counts[14], registrations: pendingRegistrations.length }, users: recentUsers, classes: classRows, subjects: subjectRows, students, teachers: teacherRows, assessments: assessmentRows, pendingRegistrations, posts: postRows, announcements: announcementRows })
}

export async function POST(request: Request) {
  const gate = await adminSession(request)
  if (gate.error) return gate.error
  const admin = gate.auth!.user
  const body = await readJson(request)
  if (!body) return apiError('invalid_json', 'صيغة الطلب غير صالحة.', 400)
  const db = requireDb()
  const action = str(body, 'action')
  const required = (...keys: string[]) => keys.every(key => str(body, key).length > 0)

  if (action === 'createAnnouncement') {
    if (!required('titleAr', 'titleEn', 'bodyAr', 'bodyEn')) return apiError('invalid_input', 'أكمل نص الإعلان باللغتين.', 400)
    const audience = str(body, 'audience') || 'all'
    if (!['all', 'students', 'teachers', 'admins', 'class'].includes(audience)) return apiError('invalid_audience', 'الجمهور غير صالح.', 400)
    const published = body.published !== false && body.published !== 'false'
    await db.insert(announcements).values({ titleAr: str(body, 'titleAr'), titleEn: str(body, 'titleEn'), bodyAr: str(body, 'bodyAr'), bodyEn: str(body, 'bodyEn'), audience: audience as 'all' | 'students' | 'teachers' | 'admins' | 'class', classId: str(body, 'classId') || null, published, publishedAt: published ? new Date() : null, authorId: admin.id })
  } else if (action === 'createClass') {
    if (!required('nameAr', 'nameEn')) return apiError('invalid_input', 'أدخل اسم الصف باللغتين.', 400)
    await db.insert(classes).values({ nameAr: str(body, 'nameAr'), nameEn: str(body, 'nameEn'), gradeLevel: num(body, 'gradeLevel'), section: str(body, 'section') || null, room: str(body, 'room') || null, capacity: num(body, 'capacity') || null })
  } else if (action === 'createSubject') {
    if (!required('code', 'nameAr', 'nameEn')) return apiError('invalid_input', 'أكمل كود المادة واسمها باللغتين.', 400)
    await db.insert(subjects).values({ code: str(body, 'code'), nameAr: str(body, 'nameAr'), nameEn: str(body, 'nameEn'), color: str(body, 'color') || null })
  } else if (action === 'createUser') {
    const role = str(body, 'role')
    if (!['student', 'teacher'].includes(role) || !required('email', 'password', 'fullNameAr', 'fullNameEn', 'code') || (role === 'student' && !str(body, 'classId'))) return apiError('invalid_input', 'أكمل معلومات الحساب والصف للطالب.', 400)
    const [user] = await db.insert(users).values({ email: str(body, 'email').toLowerCase(), passwordHash: hashPassword(str(body, 'password')), fullNameAr: str(body, 'fullNameAr'), fullNameEn: str(body, 'fullNameEn'), role: role as 'student' | 'teacher', studentNumber: role === 'student' ? str(body, 'code') : null, phone: str(body, 'phone') || null, classId: role === 'student' ? str(body, 'classId') || null : null }).returning({ id: users.id })
    if (role === 'teacher') await db.insert(teachers).values({ userId: user.id, employeeCode: str(body, 'code'), department: str(body, 'department') || null, titleAr: str(body, 'titleAr') || null, titleEn: str(body, 'titleEn') || null })
  } else if (action === 'createEvent') {
    const startsAt = date(body, 'startsAt')
    if (!required('titleAr', 'titleEn') || !startsAt) return apiError('invalid_input', 'أدخل عنوان الحدث وموعده.', 400)
    await db.insert(calendarEvents).values({ titleAr: str(body, 'titleAr'), titleEn: str(body, 'titleEn'), descriptionAr: str(body, 'descriptionAr') || null, descriptionEn: str(body, 'descriptionEn') || null, startsAt, endsAt: date(body, 'endsAt'), location: str(body, 'location') || null, classId: str(body, 'classId') || null, subjectId: str(body, 'subjectId') || null, createdBy: admin.id })
  } else if (action === 'createAssignment') {
    const dueAt = date(body, 'dueAt')
    if (!required('titleAr', 'titleEn', 'subjectId', 'classId') || !dueAt) return apiError('invalid_input', 'أكمل بيانات الواجب وموعد التسليم.', 400)
    await db.insert(assignments).values({ titleAr: str(body, 'titleAr'), titleEn: str(body, 'titleEn'), descriptionAr: str(body, 'descriptionAr') || null, descriptionEn: str(body, 'descriptionEn') || null, subjectId: str(body, 'subjectId'), classId: str(body, 'classId'), teacherId: str(body, 'teacherId') || null, dueAt, published: body.published !== false && body.published !== 'false', maxScore: num(body, 'maxScore', 100) })
  } else if (action === 'createAssessment') {
    if (!required('titleAr', 'titleEn', 'subjectId', 'classId')) return apiError('invalid_input', 'أكمل بيانات التقييم.', 400)
    const type = str(body, 'type') || 'exam'
    if (!['exam', 'quiz', 'assignment', 'project', 'participation'].includes(type)) return apiError('invalid_type', 'نوع التقييم غير صالح.', 400)
    await db.insert(assessments).values({ titleAr: str(body, 'titleAr'), titleEn: str(body, 'titleEn'), type: type as 'exam' | 'quiz' | 'assignment' | 'project' | 'participation', subjectId: str(body, 'subjectId'), classId: str(body, 'classId'), examOrder: num(body, 'examOrder') || null, maxScore: num(body, 'maxScore', 100), startsAt: date(body, 'startsAt'), published: body.published === true || body.published === 'true' })
  } else if (action === 'upsertGrade') {
    const score = num(body, 'score', Number.NaN)
    if (!required('assessmentId', 'studentId') || !Number.isFinite(score)) return apiError('invalid_input', 'حدد التقييم والطالب والدرجة.', 400)
    const [existing] = await db.select({ id: grades.id }).from(grades).where(and(eq(grades.assessmentId, str(body, 'assessmentId')), eq(grades.studentId, str(body, 'studentId')))).limit(1)
    const values = { score, feedback: str(body, 'feedback') || null, gradedBy: admin.id, gradedAt: new Date() }
    if (existing) await db.update(grades).set(values).where(eq(grades.id, existing.id))
    else await db.insert(grades).values({ assessmentId: str(body, 'assessmentId'), studentId: str(body, 'studentId'), ...values })
  } else if (action === 'assignTeacher') {
    if (!required('teacherId', 'subjectId', 'classId', 'academicYear', 'semester')) return apiError('invalid_input', 'أكمل بيانات توزيع المدرس.', 400)
    await db.insert(teachingAssignments).values({ teacherId: str(body, 'teacherId'), subjectId: str(body, 'subjectId'), classId: str(body, 'classId'), academicYear: str(body, 'academicYear'), semester: str(body, 'semester') })
  } else if (action === 'bulkGrades') {
    const lines = str(body, 'csv').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    let saved = 0
    for (const line of lines) {
      const [email, assessmentId, rawScore, ...feedback] = line.split(',').map(part => part.trim())
      const score = Number(rawScore)
      if (!email || !assessmentId || !Number.isFinite(score)) continue
      const [student] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1)
      if (!student) continue
      const [existing] = await db.select({ id: grades.id }).from(grades).where(and(eq(grades.assessmentId, assessmentId), eq(grades.studentId, student.id))).limit(1)
      const values = { score, feedback: feedback.join(',') || null, gradedBy: admin.id, gradedAt: new Date() }
      if (existing) await db.update(grades).set(values).where(eq(grades.id, existing.id))
      else await db.insert(grades).values({ assessmentId, studentId: student.id, ...values })
      saved++
    }
    return apiJson({ saved })
  } else if (action === 'sendAnnouncementNotification') {
    if (!required('titleAr', 'titleEn', 'bodyAr', 'bodyEn')) return apiError('invalid_input', 'أكمل محتوى الإشعار.', 400)
    const audience = str(body, 'audience')
    const targets = audience === 'students' || audience === 'teachers' ? await db.select({ id: users.id }).from(users).where(eq(users.role, audience === 'students' ? 'student' : 'teacher')) : await db.select({ id: users.id }).from(users)
    if (targets.length) await db.insert(notifications).values(targets.map(target => ({ userId: target.id, titleAr: str(body, 'titleAr'), titleEn: str(body, 'titleEn'), bodyAr: str(body, 'bodyAr'), bodyEn: str(body, 'bodyEn') })))
  } else if (action === 'createRule') {
    if (!required('titleAr', 'titleEn', 'bodyAr', 'bodyEn')) return apiError('invalid_input', 'أكمل نص القاعدة باللغتين.', 400)
    await db.insert(rules).values({ titleAr: str(body, 'titleAr'), titleEn: str(body, 'titleEn'), bodyAr: str(body, 'bodyAr'), bodyEn: str(body, 'bodyEn'), sortOrder: num(body, 'sortOrder'), published: body.published !== false })
  } else if (action === 'createNotification') {
    if (!required('titleAr', 'titleEn', 'bodyAr', 'bodyEn')) return apiError('invalid_input', 'أكمل بيانات الإشعار.', 400)
    await db.insert(notifications).values({ userId: str(body, 'userId') || null, titleAr: str(body, 'titleAr'), titleEn: str(body, 'titleEn'), bodyAr: str(body, 'bodyAr'), bodyEn: str(body, 'bodyEn') })
  } else if (action === 'createAttendance') {
    const at = date(body, 'date')
    const status = str(body, 'status')
    if (!required('studentId') || !at || !['present', 'late', 'absent', 'excused'].includes(status)) return apiError('invalid_input', 'تحقق من بيانات الحضور.', 400)
    await db.insert(attendanceRecords).values({ studentId: str(body, 'studentId'), date: at, status: status as 'present' | 'late' | 'absent' | 'excused', note: str(body, 'note') || null, recordedBy: admin.id })
  } else if (action === 'createLocation') {
    if (!required('nameAr', 'nameEn')) return apiError('invalid_input', 'أدخل اسم الموقع باللغتين.', 400)
    await db.insert(schoolLocations).values({ nameAr: str(body, 'nameAr'), nameEn: str(body, 'nameEn'), descriptionAr: str(body, 'descriptionAr') || null, descriptionEn: str(body, 'descriptionEn') || null, latitude: body.latitude == null ? null : num(body, 'latitude'), longitude: body.longitude == null ? null : num(body, 'longitude'), mapX: body.mapX == null ? null : num(body, 'mapX'), mapY: body.mapY == null ? null : num(body, 'mapY'), icon: str(body, 'icon') || null })
  } else if (action === 'createFile') {
    if (!required('name', 'url')) return apiError('invalid_input', 'أدخل اسم الملف ورابطه.', 400)
    await db.insert(files).values({ ownerId: str(body, 'ownerId') || admin.id, name: str(body, 'name'), url: str(body, 'url'), mimeType: str(body, 'mimeType') || null, sizeBytes: num(body, 'sizeBytes') || null, folder: str(body, 'folder') || null, visibility: (str(body, 'visibility') || 'all') as 'all' | 'students' | 'teachers' | 'admins' | 'class' })
  } else if (action === 'toggleUser') {
    const id = str(body, 'id')
    if (!id || id === admin.id) return apiError('invalid_user', 'الحساب غير صالح.', 400)
    const [target] = await db.select({ active: users.isActive }).from(users).where(eq(users.id, id)).limit(1)
    if (!target) return apiError('not_found', 'الحساب غير موجود.', 404)
    await db.update(users).set({ isActive: !target.active, updatedAt: new Date() }).where(eq(users.id, id))
  } else if (action === 'moderatePost') {
    if (!str(body, 'id')) return apiError('invalid_input', 'المنشور غير صالح.', 400)
    await db.update(communityPosts).set({ published: body.published === true, pinned: body.pinned === true, updatedAt: new Date() }).where(eq(communityPosts.id, str(body, 'id')))
  } else if (action === 'approveRegistration' || action === 'rejectRegistration') {
    const id = str(body, 'id')
    const [registration] = await db.select().from(registrationRequests).where(and(eq(registrationRequests.id, id), eq(registrationRequests.status, 'pending'))).limit(1)
    if (!registration) return apiError('not_found', 'طلب التسجيل غير موجود.', 404)
    if (action === 'approveRegistration') {
      const role: 'teacher' | 'student' | 'admin' = registration.requestedRole === 'teacher' || registration.requestedRole === 'admin' ? registration.requestedRole : 'student'
      if (!registration.fullName || !registration.birthDate || (role === 'student' && !registration.classId) || (role === 'teacher' && !registration.subjectId) || (role === 'admin' && !registration.email.includes('@'))) return apiError('invalid_registration', 'بيانات الطلب غير مكتملة.', 400)
      const matches: Array<{ id: string; role: 'student' | 'teacher' | 'admin'; studentNumber: string | null } | undefined> = []
      if (registration.googleSubject) matches.push((await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.googleSubject, registration.googleSubject)).limit(1))[0])
      matches.push((await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.email, registration.email)).limit(1))[0])
      if (registration.username) matches.push((await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.username, registration.username)).limit(1))[0])
      if (registration.phone) matches.push((await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.phone, registration.phone)).limit(1))[0])
      const identities = matches.filter((item) => Boolean(item)) as Array<{ id: string; role: 'student' | 'teacher' | 'admin'; studentNumber: string | null }>
      if (new Set(identities.map((item) => item.id)).size > 1) return apiError('identity_conflict', 'بيانات الطلب مرتبطة بأكثر من حساب.', 409)
      const existing = identities[0]
      if (existing && existing.role !== role) return apiError('role_conflict', 'المعرّف مرتبط بنوع حساب آخر.', 409)
      const studentNumber = role === 'student' ? existing?.studentNumber || `STU-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}` : null
      let userId = existing?.id
      const userValues = {
        ...(registration.googleSubject ? { googleSubject: registration.googleSubject } : {}),
        ...(registration.username ? { username: registration.username } : {}),
        ...(registration.passwordHash ? { passwordHash: registration.passwordHash } : {}),
        fullNameAr: registration.fullName,
        fullNameEn: registration.googleName || registration.fullName,
        role,
        studentNumber,
        phone: registration.phone,
        birthDate: registration.birthDate,
        classId: role === 'student' ? registration.classId : null,
        isActive: true,
        updatedAt: new Date(),
      }
      if (userId) await db.update(users).set(userValues).where(eq(users.id, userId))
      else {
        const [created] = await db.insert(users).values({ email: registration.email, ...userValues }).returning({ id: users.id })
        userId = created.id
      }
      if (role === 'teacher' && userId) {
        let [teacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, userId)).limit(1)
        if (!teacher) {
          const [subject] = await db.select({ nameAr: subjects.nameAr }).from(subjects).where(eq(subjects.id, registration.subjectId!)).limit(1)
          ;[teacher] = await db.insert(teachers).values({ userId, employeeCode: `TEA-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, department: subject?.nameAr ?? null, titleAr: 'مدرس', titleEn: 'Teacher' }).returning({ id: teachers.id })
        }
        if (teacher && registration.classId && registration.subjectId) {
          const now = new Date()
          const yearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
          const academicYear = `${yearStart}-${yearStart + 1}`
          const semester = 'العام الدراسي'
          const [assignment] = await db.select({ id: teachingAssignments.id }).from(teachingAssignments).where(and(eq(teachingAssignments.teacherId, teacher.id), eq(teachingAssignments.subjectId, registration.subjectId), eq(teachingAssignments.classId, registration.classId), eq(teachingAssignments.academicYear, academicYear), eq(teachingAssignments.semester, semester))).limit(1)
          if (!assignment) await db.insert(teachingAssignments).values({ teacherId: teacher.id, subjectId: registration.subjectId, classId: registration.classId, academicYear, semester })
        }
      }
      await db.update(registrationRequests).set({ status: 'approved', passwordHash: null, reviewedBy: admin.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(registrationRequests.id, id))
    } else await db.update(registrationRequests).set({ status: 'rejected', reviewedBy: admin.id, reviewedAt: new Date(), rejectionReason: (str(body, 'reason') || 'لم يتم قبول طلب التسجيل.').slice(0, 1000), passwordHash: null, updatedAt: new Date() }).where(eq(registrationRequests.id, id))
  } else if (action === 'updateSetting') {
    if (!required('key')) return apiError('invalid_input', 'أدخل مفتاح الإعداد.', 400)
    await db.insert(siteSettings).values({ key: str(body, 'key'), value: { value: str(body, 'value') }, updatedAt: new Date() }).onConflictDoUpdate({ target: siteSettings.key, set: { value: { value: str(body, 'value') }, updatedAt: new Date() } })
  } else if (action === 'delete') {
    const id = str(body, 'id')
    const resource = str(body, 'resource')
    switch (resource) {
      case 'class': await db.delete(classes).where(eq(classes.id, id)); break
      case 'subject': await db.delete(subjects).where(eq(subjects.id, id)); break
      case 'assessment': await db.delete(assessments).where(eq(assessments.id, id)); break
      case 'announcement': await db.delete(announcements).where(eq(announcements.id, id)); break
      case 'assignment': await db.delete(assignments).where(eq(assignments.id, id)); break
      case 'event': await db.delete(calendarEvents).where(eq(calendarEvents.id, id)); break
      case 'rule': await db.delete(rules).where(eq(rules.id, id)); break
      case 'notification': await db.delete(notifications).where(eq(notifications.id, id)); break
      case 'file': await db.delete(files).where(eq(files.id, id)); break
      case 'location': await db.delete(schoolLocations).where(eq(schoolLocations.id, id)); break
      case 'post': await db.delete(communityPosts).where(eq(communityPosts.id, id)); break
      default: return apiError('invalid_resource', 'نوع السجل غير مدعوم.', 400)
    }
  } else return apiError('invalid_action', 'الإجراء غير معروف.', 400)
  return apiJson({ saved: true })
}
