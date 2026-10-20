'use client'
import { useLanguage } from './language'
export function Localized({ar,en}:{ar:string;en:string}) { const {isEn}=useLanguage(); return <>{isEn?en:ar}</> }
