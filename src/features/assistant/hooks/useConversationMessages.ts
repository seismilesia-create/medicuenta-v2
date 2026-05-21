'use client'

import { useEffect, useState } from 'react'
import type { UIMessage } from 'ai'
import type { ChatMensaje } from '../types/chat-history'
import { rowsToUIMessages } from '../services/messages-mapper'

interface State {
  messages: UIMessage[]
  loading: boolean
  error: string | null
}

export function useConversationMessages(conversationId: string | null) {
  const [state, setState] = useState<State>({ messages: [], loading: false, error: null })

  useEffect(() => {
    if (!conversationId) {
      setState({ messages: [], loading: false, error: null })
      return
    }

    let cancelled = false
    setState({ messages: [], loading: true, error: null })

    fetch(`/api/chat/conversations/${conversationId}/messages`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: { messages: ChatMensaje[] } = await res.json()
        if (cancelled) return
        setState({ messages: rowsToUIMessages(data.messages), loading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          messages: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Error',
        })
      })

    return () => {
      cancelled = true
    }
  }, [conversationId])

  return state
}
