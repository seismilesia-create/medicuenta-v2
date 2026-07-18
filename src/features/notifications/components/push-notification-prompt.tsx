'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { usePushSubscription } from '../hooks/usePushSubscription'

const DISMISS_KEY = 'push-prompt-dismissed'

interface Props {
  /** Milisegundos antes de mostrar el prompt tras cargar (default 4s). */
  autoShowDelay?: number
}

/**
 * Tarjeta discreta que ofrece activar las notificaciones push. Aparece una vez
 * (se recuerda el dismiss en localStorage) y solo si el navegador las soporta y
 * el usuario no está suscripto ni las bloqueó.
 *
 * Se activa con un gesto (el botón "Activar") → cumple el requisito de iOS.
 */
export function PushNotificationPrompt({ autoShowDelay = 4000 }: Props) {
  const { isSupported, permission, isSubscribed, loading, subscribe } = usePushSubscription()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (loading || !isSupported || isSubscribed || permission === 'denied') return
    if (localStorage.getItem(DISMISS_KEY)) return

    const timer = setTimeout(() => setShow(true), autoShowDelay)
    return () => clearTimeout(timer)
  }, [loading, isSupported, isSubscribed, permission, autoShowDelay])

  if (!show) return null

  const handleEnable = async () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    await subscribe()
    setShow(false)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setShow(false)
  }

  return (
    <div
      className="fixed bottom-24 right-4 left-4 z-50 sm:left-auto sm:bottom-6 sm:max-w-sm
                 rounded-2xl border border-border bg-card p-4 shadow-xl animate-slide-up"
      role="dialog"
      aria-label="Activar notificaciones"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Cerrar"
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="pr-4">
          <p className="text-sm font-semibold text-foreground">¿Activar notificaciones?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Te avisamos cuando se apruebe o debite una liquidación, aunque no tengas la app abierta.
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleEnable}
          disabled={loading}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground
                     transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Activar
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}
