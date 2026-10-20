import { and, eq } from 'drizzle-orm'
import { requireDb } from '@/db'
import { assessments, grades } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProgressClient from './client'
export type ProgressAssessment={id:string;titleAr:string;titleEn:string;examOrder:number;average:number}
export const dynamic='force-dynamic'
export default async function Progress(){const user=await getCurrentUser();if(!user)redirect('/login');const rows=await requireDb().select({id:assessments.id,titleAr:assessments.titleAr,titleEn:assessments.titleEn,examOrder:assessments.examOrder,score:grades.score,maxScore:assessments.maxScore}).from(assessments).leftJoin(grades,and(eq(grades.assessmentId,assessments.id),eq(grades.studentId,user.id))).where(and(eq(assessments.published,true)));const grouped=new Map<string,{id:string;titleAr:string;titleEn:string;examOrder:number;s:number;c:number}>();for(const r of rows){if(!r.examOrder)continue;const x=grouped.get(r.id)||{id:r.id,titleAr:r.titleAr,titleEn:r.titleEn,examOrder:r.examOrder,s:0,c:0};if(r.score!==null){x.s+=(r.maxScore?r.score/r.maxScore*100:0);x.c++}grouped.set(r.id,x)}return <ProgressClient rows={[...grouped.values()].map(x=>({...x,average:x.c?x.s/x.c:0}))}/>} 
