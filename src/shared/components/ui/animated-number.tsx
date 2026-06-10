'use client'

import { useEffect, useRef, useState } from 'react'

export type NumberFormat = 'ars' | 'integer' | 'percent'

// Formateadores memoizados a nivel de módulo (no recrear Intl en cada render).
const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const INT = new Intl.NumberFormat('es-AR')

const formatters: Record<NumberFormat, (n: number) => string> = {
  ars: (n) => ARS.format(n),
  integer: (n) => INT.format(Math.round(n)),
  percent: (n) => `${n.toFixed(1)}%`,
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

interface Props {
  value: number
  format?: NumberFormat
  durationMs?: number
  className?: string
}

/**
 * Muestra un número que "cuenta" desde 0 (o desde el valor previo) hasta el
 * objetivo con un ease-out. Pensado para KPIs de dashboard/reportes.
 *
 * - SSR y primer render del cliente renderizan format(0) → sin hydration
 *   mismatch; la animación arranca en un useEffect (solo cliente).
 * - Respeta `prefers-reduced-motion`: salta directo al valor final.
 * - Si el valor cambia (ej: al filtrar reportes), reanima desde donde estaba.
 */
export function AnimatedNumber({ value, format = 'ars', durationMs = 900, className }: Props) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const currentRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current

    if (prefersReduced || from === value) {
      fromRef.current = value
      currentRef.current = value
      setDisplay(value)
      return
    }

    const delta = value - from
    let start: number | null = null
    const tick = (ts: number) => {
      if (start === null) start = ts
      const t = Math.min((ts - start) / durationMs, 1)
      const next = from + delta * easeOut(t)
      currentRef.current = next
      setDisplay(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      // Si se interrumpe (cambió el valor a mitad de animación), la próxima
      // arranca desde donde íbamos para no dar un salto.
      fromRef.current = currentRef.current
    }
  }, [value, durationMs])

  return <span className={className}>{formatters[format](display)}</span>
}
