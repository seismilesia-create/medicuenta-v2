'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConversationStore } from '../store/conversationStore'

// ⚠️ TEMPORAL (test en device): valores bajados para verificar rápido.
// REVERTIR a producción → IDLE_MS: 5*60*1000, CHECK_MS: 20*1000, PERSIST_THROTTLE_MS: 10*1000.
const IDLE_MS = 15 * 1000 // TEST: 15 s (prod: 5 min de inactividad)
const CHECK_MS = 5 * 1000 // TEST: 5 s (prod: 20 s) — cada cuánto chequeamos en foreground
const PERSIST_THROTTLE_MS = 5 * 1000 // TEST: 5 s (prod: 10 s) — máx. frecuencia de escritura del timestamp
const LAST_ACTIVITY_KEY = 'medicuenta-idle-last-activity'
// Interacción que "resetea" el contador. En celular, `touchmove` cubre el scroll.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'touchmove'] as const

/** Solo corre en celular/PWA: el layout marca `is-phone` en <html> (pointer coarse + pantalla chica). */
function esCelular(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('is-phone')
}

/**
 * Tras 5 min sin interacción, "reinicia la sesión" SIN desloguear: vuelve a
 * `/asistente` con una conversación nueva, como si el médico recién abriera la app.
 *
 * Pensado para médicos reacios a la tecnología: si dejan la app abierta en
 * cualquier pantalla, al volver la encuentran en el asistente lista para hablar,
 * en vez de perdidos en una interfaz a medio navegar. Solo en celular/PWA.
 *
 * Cubre tres escenarios (el SO puede tratar la app de formas distintas):
 *  1. App viva en foreground → el intervalo detecta el umbral.
 *  2. App suspendida y luego visible (minimizó y volvió) → `visibilitychange`.
 *  3. App CERRADA por el SO y reabierta (cold start / reload, típico en iOS) →
 *     al montar leemos el timestamp persistido; si la última actividad fue hace
 *     >5 min, reiniciamos igual, sin importar a qué URL haya arrancado.
 */
export function useIdleReset() {
  const router = useRouter()

  useEffect(() => {
    if (!esCelular()) return

    let ultimaActividad = Date.now()
    let ultimaPersistida = Date.now()

    const persistir = () => {
      ultimaPersistida = Date.now()
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(ultimaPersistida))
      } catch {
        // localStorage puede fallar (Safari en modo privado, etc.): no es crítico.
      }
    }

    const marcarActividad = () => {
      ultimaActividad = Date.now()
      // Throttle: refrescar el timestamp persistido como mucho cada PERSIST_THROTTLE_MS.
      if (ultimaActividad - ultimaPersistida >= PERSIST_THROTTLE_MS) persistir()
    }

    const reiniciar = () => {
      ultimaActividad = Date.now()
      persistir() // acabamos de "actuar" (el reinicio): rearrancamos el reloj
      // Limpia el id de conversación persistido y avisa a los chats montados
      // (home + panel) para que vuelvan a foja cero.
      useConversationStore.getState().reset()
      router.replace('/asistente')
    }

    const chequear = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimaActividad >= IDLE_MS) reiniciar()
    }

    // Boot check (escenario 3): si al montar la última actividad registrada fue
    // hace >5 min, la app estuvo cerrada un buen rato → reiniciamos de una.
    const guardado = Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? 0)
    if (guardado && Date.now() - guardado >= IDLE_MS) {
      reiniciar()
    } else {
      persistir() // arrancamos (o refrescamos) el reloj persistido
    }

    const alCambiarVisibilidad = () => {
      // Al pasar a segundo plano persistimos el último valor bueno (última chance
      // antes de que el SO pueda matar la app). Al volver, chequeamos de una.
      if (document.visibilityState === 'hidden') persistir()
      else chequear()
    }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, marcarActividad, { passive: true }))
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    const intervalo = window.setInterval(chequear, CHECK_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, marcarActividad))
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.clearInterval(intervalo)
    }
  }, [router])
}
