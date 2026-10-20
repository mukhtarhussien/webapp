import { asc, eq } from 'drizzle-orm'
import { ShieldCheck } from 'lucide-react'
import { requireDb } from '@/db'
import { rules } from '@/db/schema'
import { Localized } from '@/components/localized'
export const dynamic='force-dynamic'
export default async function Rules(){const rows=await requireDb().select().from(rules).where(eq(rules.published,true)).orderBy(asc(rules.sortOrder));return <div className="page-card card"><h1 className="page-title"><Localized ar="القواعد" en="Rules"/></h1><p className="page-subtitle"><Localized ar="القواعد المنشورة من الإدارة." en="Rules published by administration."/></p><div className="rules">{rows.length?rows.map(r=><div className="rule" key={r.id}><div className="rule-badge">{String(r.sortOrder).padStart(2,'0')}</div><div><strong><Localized ar={r.titleAr} en={r.titleEn}/></strong><p><Localized ar={r.bodyAr} en={r.bodyEn}/></p></div></div>):<p className="admin-empty"><Localized ar="لا توجد قواعد منشورة بعد." en="No published rules yet."/></p>}</div><div className="feature-card" style={{marginTop:14}}><ShieldCheck size={18}/><h3><Localized ar="إدارة مركزية" en="Central management"/></h3><p><Localized ar="يمكن للإدارة إضافة القواعد وترتيبها ونشرها مباشرة من لوحة التحكم." en="Administrators can add, order, and publish rules from the admin console."/></p></div></div>}
