'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, Save, Type } from 'lucide-react'
import { useLanguage } from '@/components/language'
import { saveAppearanceAction } from '@/app/account/actions'
import {
  APPEARANCE_FONTS,
  DEFAULT_APPEARANCE,
  isAppearanceFontFamily,
  normalizeCardSize,
  normalizeFontSize,
  type AppearanceFontFamily,
  type CardSize,
} from '@/lib/appearance'

type AppearanceSettingsProps = {
  initialFontFamily?: AppearanceFontFamily
  initialFontSize?: number
  initialCardSize?: CardSize
}

type AppearanceValues = {
  fontFamily: AppearanceFontFamily
  fontSize: number
  cardSize: CardSize
}

export function AppearanceSettings({
  initialFontFamily,
  initialFontSize,
  initialCardSize,
}: AppearanceSettingsProps) {
  const router = useRouter()
  const { isEn } = useLanguage()
  const [fontFamily, setFontFamily] = useState<AppearanceFontFamily>(
    isAppearanceFontFamily(initialFontFamily) ? initialFontFamily : DEFAULT_APPEARANCE.fontFamily,
  )
  const [fontSize, setFontSize] = useState(normalizeFontSize(initialFontSize))
  const [cardSize, setCardSize] = useState<CardSize>(normalizeCardSize(initialCardSize))
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isSaving, setIsSaving] = useState(false)

  const selectedFont = APPEARANCE_FONTS.find(font => font.id === fontFamily) ?? APPEARANCE_FONTS[6]
  const previewStyle = {
    '--portal-font-family': selectedFont.cssFamily,
    '--user-font-scale': String(fontSize / 16),
  } as CSSProperties

  const persist = async (values: AppearanceValues) => {
    setStatus('idle')
    setIsSaving(true)
    try {
      await saveAppearanceAction(values)
      setStatus('saved')
      router.refresh()
    } catch {
      setStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const save = () => { void persist({ fontFamily, fontSize, cardSize }) }
  const reset = () => {
    setFontFamily(DEFAULT_APPEARANCE.fontFamily)
    setFontSize(DEFAULT_APPEARANCE.fontSize)
    setCardSize(DEFAULT_APPEARANCE.cardSize)
    void persist({ ...DEFAULT_APPEARANCE })
  }

  const cardSizes: { id: CardSize; ar: string; en: string; helpAr: string; helpEn: string }[] = [
    { id: 'small', ar: 'صغيرة', en: 'Compact', helpAr: 'مساحة أقل', helpEn: 'Less spacing' },
    { id: 'medium', ar: 'متوسطة', en: 'Balanced', helpAr: 'التوازن الافتراضي', helpEn: 'Balanced spacing' },
    { id: 'large', ar: 'كبيرة', en: 'Comfortable', helpAr: 'مساحة أوسع', helpEn: 'More breathing room' },
  ]

  return (
    <section className="appearance-settings card">
      <div className="section-header">
        <div>
          <h2><Type size={18} /> {isEn ? 'Appearance and personalization' : 'المظهر والتخصيص'}</h2>
          <p>{isEn ? 'Choose your reading style. Changes preview immediately and are saved to your account.' : 'اختَر أسلوب القراءة المناسب لك. المعاينة تتغيّر فورًا، والحفظ يكون على حسابك.'}</p>
        </div>
      </div>

      <div className="appearance-control-block">
        <div className="appearance-control-heading">
          <div>
            <h3>{isEn ? 'Arabic font' : 'الخط العربي'}</h3>
            <p>{isEn ? 'Every option is previewed in its actual typeface.' : 'كل خيار يعرض العبارة بالخط الحقيقي نفسه.'}</p>
          </div>
          <span className="appearance-current-font">{selectedFont.nameEn}</span>
        </div>
        <div className="appearance-font-grid" role="radiogroup" aria-label={isEn ? 'Arabic font family' : 'نوع الخط العربي'}>
          {APPEARANCE_FONTS.map(font => {
            const active = font.id === fontFamily
            return (
              <button
                key={font.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`appearance-font-option${active ? ' active' : ''}`}
                onClick={() => { setFontFamily(font.id); setStatus('idle') }}
              >
                <span className="appearance-font-option-head">
                  <strong>{isEn ? font.nameEn : font.nameAr}</strong>
                  {active && <Check size={16} aria-hidden="true" />}
                </span>
                <span className="appearance-font-sample" style={{ fontFamily: font.cssFamily }} lang="ar" dir="rtl">بسم الله الرحمن الرحيم</span>
                <span className="appearance-font-description">{isEn ? font.descriptionEn : font.descriptionAr}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="appearance-control-block">
        <div className="appearance-control-heading">
          <div>
            <h3>{isEn ? 'Text size' : 'حجم الخط'}</h3>
            <p>{isEn ? 'Adjust text independently from card spacing.' : 'يتغيّر حجم النص بشكل مستقل عن مساحة البطاقات.'}</p>
          </div>
          <output className="appearance-size-value" htmlFor="appearance-font-size">{fontSize} px</output>
        </div>
        <div className="appearance-range-row">
          <span>14</span>
          <input
            id="appearance-font-size"
            type="range"
            min={14}
            max={24}
            step={1}
            value={fontSize}
            onChange={event => { setFontSize(Number(event.target.value)); setStatus('idle') }}
            aria-label={isEn ? 'Text size in pixels' : 'حجم الخط بالبكسل'}
          />
          <span>24</span>
        </div>
      </div>

      <div className="appearance-control-block">
        <div className="appearance-control-heading">
          <div>
            <h3>{isEn ? 'Card spacing' : 'حجم ومساحة البطاقات'}</h3>
            <p>{isEn ? 'This changes card padding without changing text size.' : 'هذا الخيار يغيّر المساحة الداخلية للبطاقات فقط، وليس حجم الخط.'}</p>
          </div>
        </div>
        <div className="appearance-card-size-options" role="radiogroup" aria-label={isEn ? 'Card density' : 'كثافة البطاقات'}>
          {cardSizes.map(size => (
            <button
              key={size.id}
              type="button"
              role="radio"
              aria-checked={cardSize === size.id}
              className={`appearance-card-size-option${cardSize === size.id ? ' active' : ''}`}
              onClick={() => { setCardSize(size.id); setStatus('idle') }}
            >
              <span className={`appearance-density-glyph density-${size.id}`} aria-hidden="true"><i /><i /><i /></span>
              <strong>{isEn ? size.en : size.ar}</strong>
              <small>{isEn ? size.helpEn : size.helpAr}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-control-block">
        <div className="appearance-control-heading">
          <div>
            <h3>{isEn ? 'Live preview' : 'معاينة مباشرة'}</h3>
            <p>{isEn ? 'Review the selected font, size and spacing before saving.' : 'شوف الخط والحجم والمسافات قبل الحفظ.'}</p>
          </div>
        </div>
        <div className="appearance-preview" data-card-size={cardSize} style={previewStyle} dir={isEn ? 'ltr' : 'rtl'}>
          <div className="appearance-preview-card card">
            <div className="appearance-preview-card-head">
              <span>{isEn ? 'Academic summary' : 'الملخص الدراسي'}</span>
              <strong>98%</strong>
            </div>
            <p className="appearance-preview-arabic" lang="ar" dir="rtl">بسم الله الرحمن الرحيم</p>
            <p className="appearance-preview-copy">{isEn ? 'Your school updates and study information will use this typography.' : 'تظهر تحديثات المدرسة ومعلوماتك الدراسية بهذا الخط والحجم.'}</p>
          </div>
          <div className="appearance-preview-mini-grid">
            <div className="appearance-preview-mini card"><span>{isEn ? 'Attendance' : 'الحضور'}</span><strong>96%</strong></div>
            <div className="appearance-preview-mini card"><span>{isEn ? 'Assessments' : 'التقييمات'}</span><strong>12</strong></div>
          </div>
        </div>
      </div>

      <div className="appearance-actions">
        <button className="button button-primary" type="button" onClick={save} disabled={isSaving}>
          <Save size={16} /> {isSaving ? (isEn ? 'Saving…' : 'جارٍ الحفظ…') : (isEn ? 'Save appearance' : 'حفظ التخصيص')}
        </button>
        <button className="button-secondary appearance-reset-button" type="button" onClick={reset} disabled={isSaving}>
          <RotateCcw size={15} /> {isEn ? 'Restore defaults' : 'استعادة الافتراضي'}
        </button>
        <span className={`appearance-save-status ${status === 'saved' ? 'success' : status === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
          {status === 'saved' ? (isEn ? 'Preferences saved to your account.' : 'انحفظت التفضيلات على حسابك.') : status === 'error' ? (isEn ? 'Save failed. Check your connection and try again.' : 'ما انحفظت الإعدادات. تحقق من الاتصال وأعد المحاولة.') : ''}
        </span>
      </div>
    </section>
  )
}
