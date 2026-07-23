'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Fade-in al entrar en viewport. Solo anima con `motion-safe` (con reducción de
 * movimiento el contenido queda visible desde el arranque) y un <noscript> en
 * landing-view fuerza visibilidad si no hay JS.
 */
export function Reveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: React.ReactNode
  className?: string
  delayMs?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      data-reveal
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out ${
        visible
          ? 'motion-safe:translate-y-0 motion-safe:opacity-100'
          : 'motion-safe:translate-y-6 motion-safe:opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  )
}
