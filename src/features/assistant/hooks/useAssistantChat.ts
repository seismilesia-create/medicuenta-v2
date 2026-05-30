'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  type ChatAddToolOutputFunction,
  type UIMessage,
} from 'ai'
import {
  NAVIGATION_ROUTES,
  type NavigationDestination,
} from '../config/navigation'
import { useSidePanelStore } from '../store/sidePanelStore'

interface Options {
  initialConversationId?: string
  initialMessages?: UIMessage[]
}

interface ServerMessageMetadata {
  conversationId?: string
}

const MOBILE_BREAKPOINT = '(max-width: 767px)' // matches Tailwind `md` breakpoint

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_BREAKPOINT).matches
}

/**
 * Hook central del asistente. Encapsula:
 *  - transport con reconstrucción de historial server-side (solo manda el último
 *    user message cuando la conversación ya existe → payload chico y rápido)
 *  - manejo de la tool CLIENT-SIDE `navegar` (router.push + addToolResult)
 *
 * IMPORTANTE (AI SDK v6): la tool de cliente se resuelve llamando a `addToolResult`,
 * NO retornando un valor desde onToolCall (eso ya no registra el resultado y deja
 * el mensaje colgado). Por eso usamos un ref a addToolResult dentro de onToolCall.
 */
export function useAssistantChat(options: Options = {}) {
  const { initialConversationId, initialMessages } = options

  const router = useRouter()
  const closePanel = useSidePanelStore((s) => s.close)

  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId)
  const conversationIdRef = useRef<string | undefined>(conversationId)
  conversationIdRef.current = conversationId

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages, body }) => {
          const cid = conversationIdRef.current
          // Si la conversación ya existe, el server reconstruye historial desde BD
          // y nosotros solo enviamos el último user message del turno actual.
          const payloadMessages = cid && messages.length > 0 ? [messages[messages.length - 1]] : messages
          return {
            body: {
              ...(body ?? {}),
              messages: payloadMessages,
              conversationId: cid,
            },
          }
        },
      }),
    [],
  )

  // Ref a addToolResult: onToolCall se define ANTES de que useChat devuelva
  // addToolResult, así que lo referenciamos vía ref (se invoca recién en runtime).
  const addToolResultRef = useRef<ChatAddToolOutputFunction<UIMessage> | null>(null)

  const chat = useChat({
    transport,
    messages: initialMessages,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName !== 'navegar') return // las demás tools tienen execute server-side

      const input = (toolCall.input ?? {}) as { destino?: string }
      const destino = input.destino as NavigationDestination | undefined
      const ruta = destino ? NAVIGATION_ROUTES[destino] : undefined

      if (!ruta) {
        addToolResultRef.current?.({
          tool: 'navegar',
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: `Destino desconocido: ${String(destino)}`,
        })
        return
      }

      // IMPORTANTE: registrar el resultado ANTES de navegar. router.push puede
      // desmontar este componente (ej: navegar desde el home `/` a `/ordenes`),
      // y si addToolResult corre después, se ejecutaría sobre un chat desmontado
      // → el mensaje nunca se cierra (queda "tildado").
      addToolResultRef.current?.({
        tool: 'navegar',
        toolCallId: toolCall.toolCallId,
        output: { ok: true, destino, ruta },
      })

      // En mobile el panel es overlay full-screen y taparía la pantalla destino.
      if (isMobileViewport()) closePanel()
      router.push(ruta)
    },
    onFinish: ({ message }) => {
      const meta = message.metadata as ServerMessageMetadata | undefined
      if (meta?.conversationId && conversationIdRef.current !== meta.conversationId) {
        setConversationId(meta.conversationId)
      }
    },
  })

  addToolResultRef.current = chat.addToolResult

  return {
    ...chat,
    conversationId,
    setConversationId,
  }
}
