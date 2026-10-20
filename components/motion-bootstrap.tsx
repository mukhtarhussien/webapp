'use client'

import { useEffect } from 'react'

export function MotionBootstrap() {
  useEffect(() => {
    const disabled = window.localStorage.getItem('school-pulse-motion') === 'off'
    document.documentElement.dataset.motion = disabled ? 'off' : 'on'
  }, [])
  return null
}
