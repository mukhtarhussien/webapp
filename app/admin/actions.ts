'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import crypto from 'node:crypto'
import { requireDb } from '@/db'
import {
  announcements, assessments, assignments, attendanceRecords, calendarEvents,
  classes, communityPosts, files, grades, notifications, rules, schoolLocations,
  siteSettings, subjects, teachingAssignments, teachers, users, registrationRequests, sessions
} from '@/db/schema'
import { guardAdmin } from '@/lib/admin'
import { normalizePhone } from '@/lib/security'
import { hashPassword, verifyPassword } from '@/lib/auth'
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from '@/lib/totp'

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const num = (fd: FormData, key: string) => Number(fd.get(key))
const bool = (fd: FormData, key: string) => String(fd.get(key) ?? '') === 'on'
const optionalDate = (value: string) => value ? new Date(value) : null

const refresh = async (paths: string[] = ['/admin']) => {
  paths.forEach(path => revalidatePath(path))
}

type TotpActionState = {
  ok?: boolean
  error?: string
  recoveryCodes?: string[]
}

export async function beginTotpSetupAction() {
  const admin = await guardAdmin({ allowUnconfigured: true })

  if (admin.twoFactorEnabled) return

  const secret = generateTotpSecret()

  await requireDb()
    .update(users)
    .set({
      twoFactorSecretEncrypted: encryptTotpSecret(secret),
      updatedAt: new Date(),
    })
    .where(eq(users.id, admin.id))

  revalidatePath('/admin/security')
}

export async function confirmTotpSetupAction(
  _state: TotpActionState,
  fd: FormData
) {
  const admin = await guardAdmin({ allowUnconfigured: true })
  const code = str(fd, 'code')
  const encrypted = admin.twoFactorSecretEncrypted
  const secret = decryptTotpSecret(encrypted)

  if (!secret) {
    return {
      ok: false as const,
      error: 'ابدأ إعداد المصادقة الثنائية أولًا.',
    }
  }

  if (!verifyTotpCode(secret, code)) {
    return {
      ok: false as const,
      error: 'رمز TOTP غير صحيح. تأكد من الوقت في جهازك وجرّب الرمز الحالي.',
    }
  }

  const recoveryCodes = generateRecoveryCodes()

  await requireDb()
    .update(users)
    .set({
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
      updatedAt: new Date(),
    })
    .where(eq(users.id, admin.id))

  revalidatePath('/admin')
  revalidatePath('/admin/security')

  return {
    ok: true as const,
    recoveryCodes,
  }
}

export async function disableTotpAction(
  _state: TotpActionState,
  fd: FormData
) {
  const admin = await guardAdmin({ allowUnconfigured: true })
  const password = str(fd, 'password')
  const code = str(fd, 'code')
  const secret = decryptTotpSecret(admin.twoFactorSecretEncrypted)

  if (
    !verifyPassword(password, admin.passwordHash) ||
    !secret ||
    !verifyTotpCode(secret, code)
  ) {
    return {
      ok: false as const,
      error: 'كلمة المرور أو رمز المصادقة غير صحيح.',
    }
  }

  await requireDb()
    .update(users)
    .set({
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorRecoveryCodes: [],
      updatedAt: new Date(),
    })
    .where(eq(users.id, admin.id))

  revalidatePath('/admin/security')

  return {
    ok: true as const,
  }
}

export async function regenerateRecoveryCodesAction(
  _state: TotpActionState,
  fd: FormData
) {
  const admin = await guardAdmin({ allowUnconfigured: true })
  const password = str(fd, 'password')
  const code = str(fd, 'code')
  const secret = decryptTotpSecret(admin.twoFactorSecretEncrypted)

  if (
    !admin.twoFactorEnabled ||
    !verifyPassword(password, admin.passwordHash) ||
    !secret ||
    !verifyTotpCode(secret, code)
  ) {
    return {
      ok: false as const,
      error: 'كلمة المرور أو رمز المصادقة غير صحيح.',
    }
  }

  const recoveryCodes = generateRecoveryCodes()

  await requireDb()
    .update(users)
    .set({
      twoFactorRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
      updatedAt: new Date(),
    })
    .where(eq(users.id, admin.id))

  return {
    ok: true as const,
    recoveryCodes,
  }
}

export async function approveRegistrationAction(fd: FormData) {
  const admin = await guardAdmin()
  const db = requireDb()
  const id = str(fd, 'id')
  const request = (await db.select().from(registrationRequests).where(and(eq(registrationRequests.id, id), eq(registrationRequests.status, 'pending'))).limit(1))[0]
  const role: 'student' | 'teacher' | 'admin' = request?.requestedRole === 'teacher' || request?.requestedRole === 'admin' ? request.requestedRole : 'student'

  if (!request || !request.fullName || !request.birthDate) throw new Error('INVALID_REGISTRATION')
  if (role === 'student' && !request.classId) throw new Error('INVALID_REGISTRATION')
  if (role === 'teacher' && !request.subjectId) throw new Error('INVALID_REGISTRATION')
  if (role === 'admin' && !request.email.includes('@')) throw new Error('INVALID_REGISTRATION')

  const existingGoogle = request.googleSubject
    ? (await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.googleSubject, request.googleSubject)).limit(1))[0]
    : undefined
  const existingEmail = (await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.email, request.email)).limit(1))[0]
  const existingUsername = request.username
    ? (await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.username, request.username)).limit(1))[0]
    : undefined
  const existingPhone = request.phone
    ? (await db.select({ id: users.id, role: users.role, studentNumber: users.studentNumber }).from(users).where(eq(users.phone, request.phone)).limit(1))[0]
    : undefined
  const identities = [existingGoogle, existingEmail, existingUsername, existingPhone].filter((user): user is NonNullable<typeof user> => Boolean(user))
  if (new Set(identities.map((user) => user.id)).size > 1) throw new Error('ACCOUNT_IDENTITY_CONFLICT')
  const existing = identities[0]

  if (existing && existing.role !== role) throw new Error('ACCOUNT_ROLE_CONFLICT')
  const studentNumber = role === 'student'
    ? existing?.studentNumber || `STU-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    : null
  let userId = existing?.id

  if (userId) {
    await db.update(users).set({
      ...(request.googleSubject ? { googleSubject: request.googleSubject } : {}),
      ...(request.username ? { username: request.username } : {}),
      ...(request.passwordHash ? { passwordHash: request.passwordHash } : {}),
      fullNameAr: request.fullName,
      fullNameEn: request.googleName || request.fullName,
      phone: request.phone,
      birthDate: request.birthDate,
      classId: role === 'student' ? request.classId : null,
      role,
      studentNumber,
      isActive: true,
      updatedAt: new Date(),
    }).where(eq(users.id, userId))
  } else {
    const [created] = await db.insert(users).values({
      email: request.email,
      username: request.username,
      passwordHash: request.passwordHash,
      fullNameAr: request.fullName,
      fullNameEn: request.googleName || request.fullName,
      role,
      studentNumber,
      phone: request.phone,
      birthDate: request.birthDate,
      googleSubject: request.googleSubject,
      classId: role === 'student' ? request.classId : null,
      isActive: true,
    }).returning({ id: users.id })
    userId = created.id
  }

  if (role === 'teacher' && userId) {
    let [teacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, userId)).limit(1)
    if (!teacher) {
      const [subject] = await db.select({ nameAr: subjects.nameAr }).from(subjects).where(eq(subjects.id, request.subjectId!)).limit(1)
      ;[teacher] = await db.insert(teachers).values({
        userId,
        employeeCode: `TEA-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        department: subject?.nameAr ?? null,
        titleAr: 'مدرس',
        titleEn: 'Teacher',
      }).returning({ id: teachers.id })
    }
    if (teacher && request.classId && request.subjectId) {
      const now = new Date()
      const yearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
      const academicYear = `${yearStart}-${yearStart + 1}`
      const semester = 'العام الدراسي'
      const [assignment] = await db.select({ id: teachingAssignments.id }).from(teachingAssignments).where(and(eq(teachingAssignments.teacherId, teacher.id), eq(teachingAssignments.subjectId, request.subjectId), eq(teachingAssignments.classId, request.classId), eq(teachingAssignments.academicYear, academicYear), eq(teachingAssignments.semester, semester))).limit(1)
      if (!assignment) await db.insert(teachingAssignments).values({ teacherId: teacher.id, subjectId: request.subjectId, classId: request.classId, academicYear, semester })
    }
  }

  await db.update(registrationRequests).set({ status: 'approved', passwordHash: null, reviewedBy: admin.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(registrationRequests.id, request.id))
  await refresh(['/admin', '/register'])
}

export async function rejectRegistrationAction(fd: FormData) {
  const admin = await guardAdmin()
  const db = requireDb()
  const id = str(fd, 'id')
  const reason = str(fd, 'reason') || 'لم يتم قبول طلب التسجيل.'

  await db
    .update(registrationRequests)
    .set({
      status: 'rejected',
      passwordHash: null,
      reviewedBy: admin.id,
      reviewedAt: new Date(),
      rejectionReason: reason.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(registrationRequests.id, id),
        eq(registrationRequests.status, 'pending')
      )
    )

  await refresh(['/admin', '/register'])
}

export async function createClassAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(classes).values({
    nameAr: str(fd, 'nameAr'),
    nameEn: str(fd, 'nameEn'),
    gradeLevel: num(fd, 'gradeLevel'),
    section: str(fd, 'section') || null,
    room: str(fd, 'room') || null,
    capacity: fd.get('capacity') ? num(fd, 'capacity') : null,
  })

  await refresh()
}

export async function createSubjectAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(subjects).values({
    code: str(fd, 'code'),
    nameAr: str(fd, 'nameAr'),
    nameEn: str(fd, 'nameEn'),
    color: str(fd, 'color') || null,
  })

  await refresh()
}

async function createUser(
  fd: FormData,
  role: 'student' | 'teacher'
) {
  await guardAdmin()

  const db = requireDb()

  const [user] = await db
    .insert(users)
    .values({
      email: str(fd, 'email').toLowerCase(),
      passwordHash: hashPassword(str(fd, 'password')),
      fullNameAr: str(fd, 'fullNameAr'),
      fullNameEn: str(fd, 'fullNameEn'),
      role,
      studentNumber: role === 'student' ? str(fd, 'code') : null,
      phone: str(fd, 'phone') || null,
      classId: role === 'student' ? str(fd, 'classId') || null : null,
    })
    .returning({ id: users.id })

  if (role === 'teacher') {
    await db.insert(teachers).values({
      userId: user.id,
      employeeCode: str(fd, 'code'),
      department: str(fd, 'department') || null,
      titleAr: str(fd, 'titleAr') || null,
      titleEn: str(fd, 'titleEn') || null,
    })
  }

  await refresh()
}

export async function createTeacherAction(fd: FormData) {
  await createUser(fd, 'teacher')
}

export async function createStudentAction(fd: FormData) {
  await createUser(fd, 'student')
}

export async function toggleUserAction(fd: FormData) {
  await guardAdmin()

  const db = requireDb()
  const id = str(fd, 'id')

  const row = await db
    .select({ active: users.isActive })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  if (row[0]) {
    const isActive = !row[0].active
    await db
      .update(users)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))

    if (!isActive) {
      await db.delete(sessions).where(eq(sessions.userId, id))
    }
  }

  await refresh()
}

export async function assignTeacherAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(teachingAssignments).values({
    teacherId: str(fd, 'teacherId'),
    subjectId: str(fd, 'subjectId'),
    classId: str(fd, 'classId'),
    academicYear: str(fd, 'academicYear'),
    semester: str(fd, 'semester'),
  })

  await refresh()
}

export async function createAssessmentAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(assessments).values({
    titleAr: str(fd, 'titleAr'),
    titleEn: str(fd, 'titleEn'),
    type: str(fd, 'type') as any,
    subjectId: str(fd, 'subjectId'),
    classId: str(fd, 'classId'),
    examOrder: fd.get('examOrder') ? num(fd, 'examOrder') : null,
    maxScore: num(fd, 'maxScore') || 100,
    startsAt: optionalDate(str(fd, 'startsAt')),
    published: bool(fd, 'published'),
  })

  await refresh()
}

export async function upsertGradeAction(fd: FormData) {
  const admin = await guardAdmin()
  const db = requireDb()
  const assessmentId = str(fd, 'assessmentId')
  const studentId = str(fd, 'studentId')

  const existing = await db
    .select({ id: grades.id })
    .from(grades)
    .where(
      and(
        eq(grades.assessmentId, assessmentId),
        eq(grades.studentId, studentId)
      )
    )
    .limit(1)

  const payload = {
    score: num(fd, 'score'),
    feedback: str(fd, 'feedback') || null,
    gradedBy: admin.id,
    gradedAt: new Date(),
  }

  if (existing[0]) {
    await db
      .update(grades)
      .set(payload)
      .where(eq(grades.id, existing[0].id))
  } else {
    await db.insert(grades).values({
      assessmentId,
      studentId,
      ...payload,
    })
  }

  await refresh(['/admin', '/grades', '/progress'])
}

export async function bulkGradesAction(fd: FormData) {
  const admin = await guardAdmin()
  const db = requireDb()
  const raw = str(fd, 'csv')

  for (const line of raw
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)) {
    const [
      studentIdentifier,
      assessmentId,
      score,
      ...feedbackParts
    ] = line.split(',').map(x => x.trim())

    if (
      !studentIdentifier ||
      !assessmentId ||
      Number.isNaN(Number(score))
    ) {
      continue
    }

    const normalizedIdentifier = studentIdentifier.toLowerCase()
    const normalizedPhone = normalizePhone(studentIdentifier)
    const identifierCondition = normalizedIdentifier.includes('@')
      ? eq(users.email, normalizedIdentifier)
      : /^07\d{9}$/.test(normalizedPhone)
        ? eq(users.phone, normalizedPhone)
        : eq(users.username, normalizedIdentifier)
    const student = (await db.select({ id: users.id }).from(users).where(identifierCondition).limit(1))[0]

    if (!student) continue

    const existing = (
      await db
        .select({ id: grades.id })
        .from(grades)
        .where(
          and(
            eq(grades.assessmentId, assessmentId),
            eq(grades.studentId, student.id)
          )
        )
        .limit(1)
    )[0]

    const payload = {
      score: Number(score),
      feedback: feedbackParts.join(',') || null,
      gradedBy: admin.id,
      gradedAt: new Date(),
    }

    if (existing) {
      await db
        .update(grades)
        .set(payload)
        .where(eq(grades.id, existing.id))
    } else {
      await db.insert(grades).values({
        assessmentId,
        studentId: student.id,
        ...payload,
      })
    }
  }

  await refresh(['/admin', '/grades', '/progress'])
}

export async function createAnnouncementAction(fd: FormData) {
  const admin = await guardAdmin()
  const published = bool(fd, 'published')

  await requireDb().insert(announcements).values({
    titleAr: str(fd, 'titleAr'),
    titleEn: str(fd, 'titleEn'),
    bodyAr: str(fd, 'bodyAr'),
    bodyEn: str(fd, 'bodyEn'),
    audience: str(fd, 'audience') as any,
    classId: str(fd, 'classId') || null,
    published,
    publishedAt: published ? new Date() : null,
    authorId: admin.id,
  })

  await refresh(['/admin', '/', '/notifications'])
}

export async function createAssignmentAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(assignments).values({
    titleAr: str(fd, 'titleAr'),
    titleEn: str(fd, 'titleEn'),
    descriptionAr: str(fd, 'descriptionAr') || null,
    descriptionEn: str(fd, 'descriptionEn') || null,
    subjectId: str(fd, 'subjectId'),
    classId: str(fd, 'classId'),
    teacherId: str(fd, 'teacherId') || null,
    dueAt: new Date(str(fd, 'dueAt')),
    published: bool(fd, 'published'),
    maxScore: num(fd, 'maxScore') || 100,
  })

  await refresh(['/admin', '/calendar', '/'])
}

export async function createCalendarEventAction(fd: FormData) {
  const admin = await guardAdmin()

  await requireDb().insert(calendarEvents).values({
    titleAr: str(fd, 'titleAr'),
    titleEn: str(fd, 'titleEn'),
    descriptionAr: str(fd, 'descriptionAr') || null,
    descriptionEn: str(fd, 'descriptionEn') || null,
    startsAt: new Date(str(fd, 'startsAt')),
    endsAt: optionalDate(str(fd, 'endsAt')),
    location: str(fd, 'location') || null,
    classId: str(fd, 'classId') || null,
    subjectId: str(fd, 'subjectId') || null,
    createdBy: admin.id,
  })

  await refresh(['/admin', '/calendar', '/'])
}

export async function createRuleAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(rules).values({
    titleAr: str(fd, 'titleAr'),
    titleEn: str(fd, 'titleEn'),
    bodyAr: str(fd, 'bodyAr'),
    bodyEn: str(fd, 'bodyEn'),
    sortOrder: num(fd, 'sortOrder') || 0,
    published: bool(fd, 'published'),
  })

  await refresh(['/admin', '/rules'])
}

export async function createNotificationAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(notifications).values({
    userId: str(fd, 'userId') || null,
    titleAr: str(fd, 'titleAr'),
    titleEn: str(fd, 'titleEn'),
    bodyAr: str(fd, 'bodyAr'),
    bodyEn: str(fd, 'bodyEn'),
  })

  await refresh(['/admin', '/notifications'])
}

export async function createFileAction(fd: FormData) {
  const admin = await guardAdmin()

  await requireDb().insert(files).values({
    ownerId: str(fd, 'ownerId') || admin.id,
    name: str(fd, 'name'),
    url: str(fd, 'url'),
    mimeType: str(fd, 'mimeType') || null,
    sizeBytes: fd.get('sizeBytes') ? num(fd, 'sizeBytes') : null,
    folder: str(fd, 'folder') || null,
    visibility: str(fd, 'visibility') as any,
  })

  await refresh(['/admin', '/uploads'])
}

export async function createLocationAction(fd: FormData) {
  await guardAdmin()

  await requireDb().insert(schoolLocations).values({
    nameAr: str(fd, 'nameAr'),
    nameEn: str(fd, 'nameEn'),
    descriptionAr: str(fd, 'descriptionAr') || null,
    descriptionEn: str(fd, 'descriptionEn') || null,
    latitude: fd.get('latitude') ? num(fd, 'latitude') : null,
    longitude: fd.get('longitude') ? num(fd, 'longitude') : null,
    mapX: fd.get('mapX') ? num(fd, 'mapX') : null,
    mapY: fd.get('mapY') ? num(fd, 'mapY') : null,
    icon: str(fd, 'icon') || null,
  })

  await refresh(['/admin', '/map'])
}

export async function createAttendanceAction(fd: FormData) {
  const admin = await guardAdmin()

  await requireDb().insert(attendanceRecords).values({
    studentId: str(fd, 'studentId'),
    date: new Date(str(fd, 'date')),
    status: str(fd, 'status') as any,
    note: str(fd, 'note') || null,
    recordedBy: admin.id,
  })

  await refresh(['/admin', '/account'])
}

export async function moderatePostAction(fd: FormData) {
  await guardAdmin()

  await requireDb()
    .update(communityPosts)
    .set({
      published: bool(fd, 'published'),
      pinned: bool(fd, 'pinned'),
      updatedAt: new Date(),
    })
    .where(eq(communityPosts.id, str(fd, 'id')))

  await refresh(['/admin', '/community'])
}

export async function updateSettingAction(fd: FormData) {
  await guardAdmin()

  const key = str(fd, 'key')
  const value = str(fd, 'value')

  await requireDb()
    .insert(siteSettings)
    .values({
      key,
      value: { value },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: {
        value: { value },
        updatedAt: new Date(),
      },
    })

  await refresh()
}

export async function sendAnnouncementNotificationAction(
  fd: FormData
) {
  await guardAdmin()

  const db = requireDb()

  const titleAr = str(fd, 'titleAr')
  const titleEn = str(fd, 'titleEn')
  const bodyAr = str(fd, 'bodyAr')
  const bodyEn = str(fd, 'bodyEn')
  const target = str(fd, 'audience')

  const targets =
    target === 'students' || target === 'teachers'
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, target as any))
      : await db
          .select({ id: users.id })
          .from(users)

  if (targets.length) {
    await db.insert(notifications).values(
      targets.map(u => ({
        userId: u.id,
        titleAr,
        titleEn,
        bodyAr,
        bodyEn,
      }))
    )
  }

  await refresh(['/admin', '/notifications'])
}

export async function deleteContentAction(fd: FormData) {
  await guardAdmin()

  const db = requireDb()
  const id = str(fd, 'id')
  const resource = str(fd, 'resource')

  switch (resource) {
    case 'class':
      await db.delete(classes).where(eq(classes.id, id))
      break

    case 'subject':
      await db.delete(subjects).where(eq(subjects.id, id))
      break

    case 'assessment':
      await db.delete(assessments).where(eq(assessments.id, id))
      break

    case 'announcement':
      await db.delete(announcements).where(eq(announcements.id, id))
      break

    case 'assignment':
      await db.delete(assignments).where(eq(assignments.id, id))
      break

    case 'event':
      await db.delete(calendarEvents).where(eq(calendarEvents.id, id))
      break

    case 'rule':
      await db.delete(rules).where(eq(rules.id, id))
      break

    case 'notification':
      await db.delete(notifications).where(eq(notifications.id, id))
      break

    case 'file':
      await db.delete(files).where(eq(files.id, id))
      break

    case 'location':
      await db.delete(schoolLocations).where(eq(schoolLocations.id, id))
      break

    case 'post':
      await db.delete(communityPosts).where(eq(communityPosts.id, id))
      break

    default:
      throw new Error('Unsupported resource')
  }

  await refresh()
              }
