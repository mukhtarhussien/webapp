'use client'

import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'

export function MotionToggle({ compact = false }: { compact?: boolean }) {
  const [disabled, setDisabled] = useState(false)
  useEffect(() => {
    setDisabled(window.localStorage.getItem('school-pulse-motion') === 'off')
  }, [])
  const toggle = () => {
    const next = !disabled
    setDisabled(next)
    window.localStorage.setItem('school-pulse-motion', next ? 'off' : 'on')
    document.documentElement.dataset.motion = next ? 'off' : 'on'
  }
  return <button type="button" className={'motion-toggle' + (compact ? ' compact' : '')} onClick={toggle} aria-pressed={disabled}>
    {disabled ? <Play size={16}/> : <Pause size={16}/>}<span>{disabled ? 'تفعيل الرسوم المتحركة' : 'تعطيل الرسوم المتحركة'}</span>
  </button>
}
