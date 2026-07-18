'use client'

import { useCallback, useEffect, useState } from 'react'

interface UsePushSubscriptionReturn {
  /** El navegador soporta Notification + ServiceWorker + PushManager. */
  isSupported: boolean
  permission: NotificationPermission | 'unsupported'
  isSubscribed: boolean
  loading: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

// Convierte la VAPID public key (base64url) al Uint8Array que espera pushManager.
// Se construye sobre un ArrayBuffer explícito para que el tipo sea Uint8Array<ArrayBuffer>
// (BufferSource válido) y no Uint8Array<ArrayBufferLike>, que TS strict rechaza.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Maneja la suscripción a Web Push del dispositivo actual.
 * El `user_id` NO se manda desde el cliente: la ruta /api/notifications/subscribe
 * lo deriva de la sesión (RLS). El hook solo lidia con el navegador.
 *
 * iOS: solo funciona en la PWA instalada (Agregar a pantalla de inicio) y la
 * suscripción debe dispararse desde un gesto del usuario (el botón "Activar").
 */
export function usePushSubscription(): UsePushSubscriptionReturn {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window

    setIsSupported(supported)
    if (!supported) {
      setLoading(false)
      return
    }

    setPermission(Notification.permission)
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .finally(() => setLoading(false))
  }, [])

  const subscribe = useCallback(async () => {
    if (!isSupported) return
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        console.error('[Push] Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) throw new Error(`subscribe HTTP ${res.status}`)

      setIsSubscribed(true)
    } catch (err) {
      console.error('[Push] Suscripción falló:', err)
    } finally {
      setLoading(false)
    }
  }, [isSupported])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('[Push] Desuscripción falló:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe }
}
