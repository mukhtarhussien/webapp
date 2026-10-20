'use client'
import { createContext, useContext, useMemo, useState } from 'react'

type Lang = 'ar' | 'en'
type LanguageContextValue = { lang: Lang; isEn: boolean; toggle: () => void }
const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ar')
  const value = useMemo(() => ({ lang, isEn: lang === 'en', toggle: () => setLang(v => v === 'ar' ? 'en' : 'ar') }), [lang])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
