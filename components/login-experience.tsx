'use client'

import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { MotionToggle } from '@/components/motion-toggle'

export function LoginExperience({ children, logoUrl, portalNameAr, portalNameEn }: {
  children: React.ReactNode
  logoUrl: string
  portalNameAr: string
  portalNameEn: string
}) {
  const [phase, setPhase] = useState<'checking' | 'welcome' | 'ready'>('checking')

  useEffect(() => {
    const seen = window.localStorage.getItem('school-portal-welcome-seen') === 'yes'
    const motionOff = window.localStorage.getItem('school-pulse-motion') === 'off'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (seen || motionOff || reduced) {
      setPhase('ready')
      return
    }
    setPhase('welcome')
    const timer = window.setTimeout(() => {
      window.localStorage.setItem('school-portal-welcome-seen', 'yes')
      setPhase('ready')
    }, 1350)
    return () => window.clearTimeout(timer)
  }, [])

  return <div className={'login-experience phase-' + phase}>
    {phase === 'welcome' && <div className="welcome-splash" aria-live="polite">
      <div className="welcome-mark">
        {logoUrl ? <img src={logoUrl} alt={portalNameAr} /> : <GraduationCap size={30} strokeWidth={1.6} />}
      </div>
      <p className="welcome-kicker">{portalNameEn}</p>
      <h1>{'أهلًا بك'}</h1>
      <p className="welcome-name">{portalNameAr}</p>
    </div>}
    <div className={'login-stage ' + (phase === 'ready' ? 'is-ready' : '')}>
      <div className="login-motion-control"><MotionToggle /></div>
      {children}
    </div>
  </div>
}
