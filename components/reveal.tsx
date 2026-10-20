'use client'

import { useEffect, useRef, useState } from 'react'

export function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const motionOff = window.localStorage.getItem('school-pulse-motion') === 'off'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (motionOff || reduced || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} className={'reveal ' + (visible ? 'is-visible ' : '') + className} style={{ '--reveal-delay': delay + 'ms' } as React.CSSProperties}>{children}</div>
}
