'use client'

import { useState, useRef, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'

interface Options {
  initialConversationId?: string
  initialMessages?: UIMessage[]
}

interface ServerMessageMetadata {
  conversationId?: string
}

export function useAssistantChat(options: Options = {}) {
  const { initialConversationId, initialMessages } = options

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

  const chat = useChat({
    transport,
    messages: initialMessages,
    onFinish: ({ message }) => {
      const meta = message.metadata as ServerMessageMetadata | undefined
      if (meta?.conversationId && conversationIdRef.current !== meta.conversationId) {
        setConversationId(meta.conversationId)
      }
    },
  })

  return {
    ...chat,
    conversationId,
    setConversationId,
  }
}
