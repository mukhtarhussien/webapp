'use client'

import { Download, FileArchive, LoaderCircle, UploadCloud } from 'lucide-react'
import { useState } from 'react'

export function AppUploadManager({ currentName = '', currentVersion = '' }: { currentName?: string; currentVersion?: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [version, setVersion] = useState(currentVersion)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) { setStatus('اختر ملف APK أولًا.'); return }
    if (!file.name.toLowerCase().endsWith('.apk')) { setStatus('المسموح ملف Android بصيغة APK فقط.'); return }
    if (file.size > 200 * 1024 * 1024) { setStatus('حجم الملف يتجاوز 200 ميغابايت.'); return }
    if (!version.trim()) { setStatus('اكتب رقم الإصدار.'); return }
    setBusy(true); setFinished(false); setStatus('جارٍ تجهيز رفع آمن…')
    try {
      const signed = await fetch('/api/admin/app-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, version: version.trim() })
      })
      const signedData = await signed.json()
      if (!signed.ok) throw new Error(signedData.error || 'تعذر تجهيز الرفع.')
      setStatus('جارٍ رفع التطبيق إلى التخزين…')
      const upload = await fetch(signedData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': signedData.contentType }, body: file })
      if (!upload.ok) throw new Error('فشل رفع الملف إلى التخزين. تحقق من إعدادات Object Storage وCORS ثم أعد المحاولة.')
      setStatus('جارٍ حفظ الإصدار…')
      const complete = await fetch('/api/admin/app-upload/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectKey: signedData.objectKey, fileName: file.name, sizeBytes: file.size, version: version.trim() })
      })
      const completeData = await complete.json()
      if (!complete.ok) throw new Error(completeData.error || 'تم الرفع لكن تعذر حفظ بيانات الإصدار.')
      setFinished(true); setStatus('تم نشر الإصدار. زر تنزيل التطبيق أصبح جاهزًا.')
      setFile(null)
      window.location.reload()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'حدث خطأ غير متوقع.')
    } finally { setBusy(false) }
  }

  return <div className="app-release-manager">
    <div className="app-release-current">
      <div className="app-release-symbol"><FileArchive size={21}/></div>
      <div><strong>{currentName || 'إصدار التطبيق الحالي'}</strong><span>{currentVersion ? 'الإصدار ' + currentVersion : 'لم يُنشر تطبيق حتى الآن'}</span></div>
      <a href="/api/app/download" className="admin-small-button" title="اختبار التنزيل"><Download size={15}/></a>
    </div>
    <form className="app-release-form" onSubmit={submit}>
      <label className="admin-field"><span>ملف Android (APK)</span><input type="file" accept=".apk,application/vnd.android.package-archive" onChange={event => setFile(event.target.files?.[0] ?? null)} required /></label>
      <label className="admin-field"><span>رقم الإصدار</span><input value={version} onChange={event => setVersion(event.target.value)} placeholder="مثال: 1.0.3" required /></label>
      {file && <p className="app-release-file"><FileArchive size={15}/>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <UploadCloud size={16}/>} {busy ? 'جارٍ الرفع…' : 'رفع ونشر الإصدار'}</button>
      {status && <p className={'app-release-status' + (finished ? ' success' : '')} role="status">{status}</p>}
    </form>
  </div>
}
