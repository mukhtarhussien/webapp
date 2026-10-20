import { desc, eq } from 'drizzle-orm'
import { Download, FileText, MoreHorizontal } from 'lucide-react'
import { requireDb } from '@/db'
import { files } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { Localized } from '@/components/localized'
import { redirect } from 'next/navigation'
export const dynamic='force-dynamic'
export default async function Uploads(){const user=await getCurrentUser();if(!user)redirect('/login');const rows=await requireDb().select().from(files).where(eq(files.ownerId,user.id)).orderBy(desc(files.createdAt)).limit(50);return <div className="page-card card"><h1 className="page-title"><Localized ar="الملفات التي رفعتها" en="Uploaded files"/></h1><p className="page-subtitle"><Localized ar="ملفاتك المحفوظة في التخزين ومراجعها من قاعدة البيانات." en="Your saved files and their database records."/></p><div style={{marginTop:13}}>{rows.length?rows.map(f=><div className="upload-row" key={f.id}><div className="file-icon"><FileText size={17}/></div><div><strong>{f.name}</strong><span>{f.mimeType??'file'} · {f.sizeBytes?`${f.sizeBytes} bytes`:''}</span></div><a href={f.url} target="_blank" rel="noreferrer" className="icon-button" aria-label="Download"><Download size={15}/></a><button className="icon-button" style={{width:34,height:34}} aria-label="More"><MoreHorizontal size={15}/></button></div>):<p className="admin-empty"><Localized ar="لا توجد ملفات مرفوعة." en="No uploaded files."/></p>}</div></div>}
