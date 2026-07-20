'use client'

import { Bell, BellOff, Loader2, Check } from 'lucide-react'
import { usePushSubscription } from '../hooks/usePushSubscription'

/**
 * Control permanente de notificaciones push, para la página de Perfil.
 * A diferencia del prompt automático (que aparece una sola vez), esto está
 * siempre disponible para activar/desactivar cuando el usuario quiera.
 */
export function NotificacionesSettings() {
  const { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe } =
    usePushSubscription()

  return (
    <section
      className="rounded-xl p-4 md:p-6 max-w-2xl"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <div className="flex items-start gap-3 mb-5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <Bell className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
            Notificaciones
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--color-foreground-secondary)' }}>
            Recibí avisos de aprobaciones, débitos y vencimientos, aunque no tengas la app abierta.
          </p>
        </div>
      </div>

      {/* Estado 1: cargando */}
      {loading && (
        <p
          className="inline-flex items-center gap-2 text-sm"
          style={{ color: 'var(--color-foreground-muted)' }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando…
        </p>
      )}

      {/* Estado 2: navegador/dispositivo no soporta (típico iOS sin instalar) */}
      {!loading && !isSupported && (
        <p className="text-sm" style={{ color: 'var(--color-foreground-muted)' }}>
          Para activar las notificaciones, instalá MediCuenta en tu celular
          (menú del navegador → «Agregar a pantalla de inicio») y volvé a entrar desde el ícono.
        </p>
      )}

      {/* Estado 3: permiso bloqueado por el usuario */}
      {!loading && isSupported && permission === 'denied' && (
        <p
          className="text-sm rounded-lg p-3"
          style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}
        >
          Bloqueaste las notificaciones en este dispositivo. Activá el permiso desde la
          configuración del sitio en tu navegador y volvé a intentar.
        </p>
      )}

      {/* Estado 4: activadas → opción de desactivar */}
      {!loading && isSupported && permission !== 'denied' && isSubscribed && (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: 'var(--color-success)' }}
          >
            <Check className="h-4 w-4" />
            Activadas en este dispositivo
          </span>
          <button
            type="button"
            onClick={unsubscribe}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-foreground)' }}
          >
            <BellOff className="h-4 w-4" />
            Desactivar
          </button>
        </div>
      )}

      {/* Estado 5: soportado, no bloqueado, no suscripto → activar */}
      {!loading && isSupported && permission !== 'denied' && !isSubscribed && (
        <button
          type="button"
          onClick={subscribe}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }}
        >
          <Bell className="h-4 w-4" />
          Activar notificaciones
        </button>
      )}
    </section>
  )
}
