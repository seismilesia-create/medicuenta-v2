'use client'

import { useEffect } from 'react'

/**
 * Registra el Service Worker de la PWA (capa de instalabilidad).
 * DEBE renderizarse en el layout raíz; si se quita, la app deja de ser
 * instalable de forma silenciosa.
 *
 * Gotchas ya resueltos:
 *  - Usa window.location.origin para la URL del SW (iOS rechaza redirects 307).
 *  - Corre en un efecto de cliente: no bloquea ni rompe el streaming de Next.
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const swUrl = `${window.location.origin}/sw.js`

    navigator.serviceWorker
      .register(swUrl, { scope: '/' })
      .then((registration) => {
        // Chequea updates cada 60 minutos.
        const interval = setInterval(() => registration.update(), 60 * 60 * 1000)

        // Cuando hay una versión nueva activada, la promueve y recarga una vez.
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' })
              setTimeout(() => window.location.reload(), 1000)
            }
          })
        })

        return () => clearInterval(interval)
      })
      .catch((err) => console.error('[PWA] Registro del Service Worker falló:', err))
  }, [])

  return null
}
