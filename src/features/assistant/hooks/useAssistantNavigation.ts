'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  NAVIGATION_ROUTES,
  type NavigationDestination,
} from '../config/navigation'
import { useSidePanelStore } from '../store/sidePanelStore'

type ToolCallArg = {
  toolCall: {
    toolName: string
    toolCallId: string
    input?: unknown
  }
}

const MOBILE_BREAKPOINT = '(max-width: 767px)' // matches Tailwind `md` breakpoint

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_BREAKPOINT).matches
}

/**
 * Devuelve un handler para `useChat({ onToolCall })`.
 *
 * Cuando el modelo emite la tool `navegar` (definida sin `execute` en el server),
 * el handler:
 *   1. Hace `router.push` a la ruta correspondiente
 *   2. En mobile, cierra el panel del asistente para que el médico vea la
 *      sección destino (en mobile el panel es overlay full-screen y taparía
 *      la pantalla nueva). En desktop el panel es lateral y no estorba,
 *      así que lo dejamos abierto para que el médico siga charlando.
 *   3. Retorna el resultado, que el AI SDK toma como output de la tool
 *
 * El resto de tools tienen `execute` server-side, así que el handler las ignora
 * (retornar undefined le dice al SDK "no manejé esta tool en cliente").
 */
export function useAssistantNavigation() {
  const router = useRouter()
  const closePanel = useSidePanelStore((s) => s.close)

  return useCallback(
    async ({ toolCall }: ToolCallArg) => {
      if (toolCall.toolName !== 'navegar') return

      const input = (toolCall.input ?? {}) as { destino?: string }
      const destino = input.destino as NavigationDestination | undefined
      const ruta = destino ? NAVIGATION_ROUTES[destino] : undefined

      if (!ruta) {
        return { ok: false, error: `Destino desconocido: ${String(destino)}` }
      }

      router.push(ruta)

      // Auto-cerrar en mobile para que el médico vea la pantalla destino.
      // En desktop el panel es lateral (no bloquea), lo dejamos como está.
      if (isMobileViewport()) {
        closePanel()
      }

      return { ok: true, destino, ruta }
    },
    [router, closePanel],
  )
}
