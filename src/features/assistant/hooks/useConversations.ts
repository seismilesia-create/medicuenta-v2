'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ChatConversacion } from '../types/chat-history'

interface State {
  items: ChatConversacion[]
  nextCursor: string | null
  loading: boolean
  error: string | null
}

export function useConversations() {
  const [state, setState] = useState<State>({
    items: [],
    nextCursor: null,
    loading: true,
    error: null,
  })

  const loadFirstPage = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch('/api/chat/conversations?limit=50')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { conversations: ChatConversacion[]; nextCursor: string | null } = await res.json()
      setState({
        items: data.conversations,
        nextCursor: data.nextCursor,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Error',
      }))
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loading) return
    setState((s) => ({ ...s, loading: true }))
    try {
      const res = await fetch(
        `/api/chat/conversations?limit=50&cursor=${encodeURIComponent(state.nextCursor)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { conversations: ChatConversacion[]; nextCursor: string | null } = await res.json()
      setState((s) => ({
        items: [...s.items, ...data.conversations],
        nextCursor: data.nextCursor,
        loading: false,
        error: null,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Error',
      }))
    }
  }, [state.nextCursor, state.loading])

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' })
    if (!res.ok) return false
    setState((s) => ({ ...s, items: s.items.filter((c) => c.id !== id) }))
    return true
  }, [])

  useEffect(() => {
    loadFirstPage()
  }, [loadFirstPage])

  return {
    items: state.items,
    nextCursor: state.nextCursor,
    loading: state.loading,
    error: state.error,
    reload: loadFirstPage,
    loadMore,
    remove,
  }
}
