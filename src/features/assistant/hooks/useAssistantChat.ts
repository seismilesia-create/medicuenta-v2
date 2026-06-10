'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
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
import { useConversationStore } from '../store/conversationStore'
import { rowsToUIMessages } from '../services/messages-mapper'

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
  const storedConversationId = useConversationStore((s) => s.conversationId)
  const persistConversationId = useConversationStore((s) => s.setConversationId)

  // Si no nos pasaron uno explícito, retomamos la conversación activa persistida
  // (localStorage) para no perder el chat al salir y volver a la sección.
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId ?? storedConversationId ?? undefined,
  )
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
        persistConversationId(meta.conversationId) // recordar para próximos montajes
      }
    },
  })

  addToolResultRef.current = chat.addToolResult

  // Red de seguridad: capturamos el conversationId apenas aparezca en la metadata
  // de CUALQUIER mensaje (no solo en onFinish), y lo persistimos. Así, aunque el
  // timing del stream varíe, el id queda guardado para restaurar al volver.
  const lastPersistedRef = useRef<string | null>(null)
  useEffect(() => {
    for (const m of chat.messages) {
      const meta = m.metadata as ServerMessageMetadata | undefined
      const cid = meta?.conversationId
      if (cid && lastPersistedRef.current !== cid) {
        lastPersistedRef.current = cid
        if (conversationIdRef.current !== cid) setConversationId(cid)
        persistConversationId(cid)
        break
      }
    }
  }, [chat.messages, persistConversationId])

  // Restauración: si hay una conversación previa (explícita o persistida en
  // localStorage) y no nos dieron mensajes iniciales, traemos su historial de la
  // BD y lo sembramos en el chat.
  //
  // El efecto es REACTIVO a `storedConversationId`: zustand/persist puede
  // rehidratar desde localStorage DESPUÉS del primer render (sobre todo tras
  // recargar). Si dependiéramos de [] el efecto correría con null y nunca
  // restauraría. `restoredIdRef` evita re-restaurar el mismo id, y no pisamos un
  // chat que ya tiene mensajes (ej: el que acaba de crear la conversación).
  const setMessagesRef = useRef(chat.setMessages)
  setMessagesRef.current = chat.setMessages
  const msgCountRef = useRef(0)
  msgCountRef.current = chat.messages.length
  const restoredIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) return
    const idToRestore = initialConversationId ?? storedConversationId
    if (!idToRestore || restoredIdRef.current === idToRestore) return

    // Marcamos como manejado ya — tanto si restauramos como si no, para no
    // reintentar en cada render.
    restoredIdRef.current = idToRestore

    // Aseguramos que el transport apunte a esta conversación para los próximos
    // mensajes (si no, crearía una conversación nueva y huérfana).
    if (conversationIdRef.current !== idToRestore) setConversationId(idToRestore)

    // Si el chat ya tiene mensajes (esta instancia está en uso), no lo pisamos.
    if (msgCountRef.current > 0) return

    let cancelled = false
    fetch(`/api/chat/conversations/${idToRestore}/messages`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { messages: Parameters<typeof rowsToUIMessages>[0] }) => {
        if (cancelled || msgCountRef.current > 0) return
        const msgs = rowsToUIMessages(data.messages)
        if (msgs.length > 0) setMessagesRef.current(msgs)
      })
      .catch(() => {
        // Conversación inexistente/borrada o sin acceso: arrancamos limpio.
      })

    return () => {
      cancelled = true
    }
  }, [storedConversationId, initialConversationId, initialMessages])

  return {
    ...chat,
    conversationId,
    setConversationId,
  }
}
