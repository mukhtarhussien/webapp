'use client'

import { useEffect, useRef, type ReactNode } from 'react'

type Props = { children: ReactNode; threadKey: string }

export function ChatHistory({ children, threadKey }: Props) {
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const history = historyRef.current
    if (history) history.scrollTop = history.scrollHeight
  }, [threadKey])

  return <div className="chat-history" aria-live="polite" ref={historyRef}>{children}</div>
}
