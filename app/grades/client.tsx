'use client'
import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useLanguage } from '@/components/language'
import type { GradeRow } from './page'
export default function GradesClient({rows}:{rows:GradeRow[]}){
  const {isEn}=useLanguage(); const [order,setOrder]=useState<'all'|'first'|'second'>('all')
  const filtered=order==='all'?rows:rows.filter(r=>r.examOrder===(order==='first'?1:2))
  return <div className="page-card card"><div className="page-title-row"><div><h1 className="page-title">{isEn?'Grades':'الدرجات'}</h1><p className="page-subtitle">{isEn?'Results loaded from your school database.':'النتائج المحفوظة في قاعدة بيانات المدرسة.'}</p></div><div className="stat-icon blue"><BarChart3 size={20}/></div></div><div className="filter-row"><button className={`filter-button ${order==='all'?'active':''}`} onClick={()=>setOrder('all')}>{isEn?'All':'الكل'}</button><button className={`filter-button ${order==='first'?'active':''}`} onClick={()=>setOrder('first')}>{isEn?'Exam 1':'الامتحان الأول'}</button><button className={`filter-button ${order==='second'?'active':''}`} onClick={()=>setOrder('second')}>{isEn?'Exam 2':'الامتحان الثاني'}</button></div>{filtered.length?<table className="data-table"><thead><tr><th>{isEn?'Subject':'المادة'}</th><th>{isEn?'Assessment':'التقييم'}</th><th>{isEn?'Score':'الدرجة'}</th><th>{isEn?'Out of':'من'}</th><th>{isEn?'Exam order':'ترتيب الامتحان'}</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><strong>{isEn?r.subjectEn:r.subjectAr}</strong></td><td>{isEn?r.titleEn:r.titleAr}</td><td className="grade-chip">{r.score}</td><td>{r.maxScore}</td><td>{r.examOrder??'—'}</td></tr>)}</tbody></table>:<p className="admin-empty"><span>{isEn?'No published grades are available yet.':'لا توجد درجات منشورة بعد.'}</span></p>}</div>
}
