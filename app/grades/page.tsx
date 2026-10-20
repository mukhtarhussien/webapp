import { eq, and } from 'drizzle-orm'
import { requireDb } from '@/db'
import { assessments, grades, subjects } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GradesClient from './client'
export type GradeRow={id:string;subjectAr:string;subjectEn:string;titleAr:string;titleEn:string;score:number;maxScore:number;examOrder:number|null}
export const dynamic='force-dynamic'
export default async function Grades(){const user=await getCurrentUser();if(!user)redirect('/login');const rows=await requireDb().select({id:grades.id,subjectAr:subjects.nameAr,subjectEn:subjects.nameEn,titleAr:assessments.titleAr,titleEn:assessments.titleEn,score:grades.score,maxScore:assessments.maxScore,examOrder:assessments.examOrder}).from(grades).innerJoin(assessments,eq(assessments.id,grades.assessmentId)).innerJoin(subjects,eq(subjects.id,assessments.subjectId)).where(and(eq(grades.studentId,user.id),eq(assessments.published,true)));return <GradesClient rows={rows}/>} 
