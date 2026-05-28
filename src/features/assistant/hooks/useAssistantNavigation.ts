'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  NAVIGATION_ROUTES,
  type NavigationDestination,
} from '../config/navigation'

type ToolCallArg = {
  toolCall: {
    toolName: string
    toolCallId: string
    input?: unknown
  }
}

/**
 * Devuelve un handler para `useChat({ onToolCall })`.
 *
 * Cuando el modelo emite la tool `navegar` (definida sin `execute` en el server),
 * el handler:
 *   1. Hace `router.push` a la ruta correspondiente
 *   2. Retorna el resultado, que el AI SDK toma como output de la tool
 *
 * El resto de tools tienen `execute` server-side, así que el handler las ignora
 * (retornar undefined le dice al SDK "no manejé esta tool en cliente").
 */
export function useAssistantNavigation() {
  const router = useRouter()

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
      return { ok: true, destino, ruta }
    },
    [router],
  )
}
