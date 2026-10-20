'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language'

type Props = { userId: string; fullName: string; profilePhotoKey?: string }
type SaveResponse = { photoKey?: string; error?: string }

function photoUrl(userId: string, key?: string) {
  return key ? `/api/profile-photo/${userId}?v=${encodeURIComponent(key)}` : ''
}

export function ProfilePhotoSettings({ userId, fullName, profilePhotoKey: initialKey }: Props) {
  const router = useRouter()
  const { isEn } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [photoKey, setPhotoKey] = useState(initialKey)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => setPhotoKey(initialKey), [initialKey])

  async function upload(file: File) {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.size > 12 * 1024 * 1024) {
      setNotice(isEn ? 'Choose an image smaller than 12 MB.' : 'اختَر صورة أقل من ١٢ ميغابايت.')
      return
    }

    setBusy(true)
    setNotice(isEn ? 'Preparing photo…' : 'جارٍ تجهيز الصورة…')
    try {
      const image = await createImageBitmap(file)
      const side = Math.min(image.width, image.height)
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const context = canvas.getContext('2d')
      if (!context) throw new Error('IMAGE_PROCESSING_FAILED')
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 512, 512)
      image.close()
      const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84))
      if (!compressed) throw new Error('IMAGE_PROCESSING_FAILED')

      const payload = new FormData()
      payload.append('photo', compressed, 'profile-photo.jpg')
      const response = await fetch('/api/profile-photo', { method: 'POST', body: payload })
      const result = await response.json() as SaveResponse
      if (!response.ok || !result.photoKey) throw new Error(result.error || 'UPLOAD_FAILED')

      setPhotoKey(result.photoKey)
      setNotice(isEn ? 'Profile photo saved.' : 'انحفظت الصورة الشخصية.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error && error.message !== 'UPLOAD_FAILED' && error.message !== 'IMAGE_PROCESSING_FAILED'
        ? error.message
        : isEn ? 'Photo upload failed. Try again.' : 'ما انرفعت الصورة. حاول مرة ثانية.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removePhoto() {
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/profile-photo', { method: 'DELETE' })
      const result = await response.json() as SaveResponse
      if (!response.ok) throw new Error(result.error || 'REMOVE_FAILED')
      setPhotoKey(undefined)
      setNotice(isEn ? 'Profile photo removed.' : 'انحذفت الصورة الشخصية.')
      router.refresh()
    } catch {
      setNotice(isEn ? 'Could not remove the photo. Try again.' : 'ما قدرنا نحذف الصورة. حاول مرة ثانية.')
    } finally {
      setBusy(false)
    }
  }

  const src = photoUrl(userId, photoKey)
  return <div className="profile-photo-settings">
    <div className="profile-photo-preview">
      {src ? <img src={src} alt={fullName} /> : <span>{fullName.slice(0, 1)}</span>}
    </div>
    <div className="profile-photo-copy">
      <strong>{isEn ? 'Profile photo' : 'الصورة الشخصية'}</strong>
      <p>{isEn ? 'Shown beside your name across the school portal.' : 'تظهر بجانب اسمك في صفحات التواصل بالمدرسة.'}</p>
      <div className="profile-photo-actions">
        <input ref={inputRef} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void upload(file) }} />
        <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={16} className="profile-photo-spinner" /> : <ImagePlus size={16} />}
          {isEn ? 'Choose photo' : 'اختَر صورة'}
        </button>
        {photoKey && <button type="button" className="quiet-danger" onClick={() => void removePhoto()} disabled={busy} aria-label={isEn ? 'Remove profile photo' : 'حذف الصورة الشخصية'} title={isEn ? 'Remove photo' : 'حذف الصورة'}><Trash2 size={16}/></button>}
      </div>
      <span className="profile-photo-notice" role="status" aria-live="polite">{notice}</span>
    </div>
  </div>
}
