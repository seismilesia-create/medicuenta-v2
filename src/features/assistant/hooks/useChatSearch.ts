'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatSearchFilters, ChatSearchResultRow } from '../types/chat-history'

interface State {
  results: ChatSearchResultRow[]
  loading: boolean
  error: string | null
}

const DEBOUNCE_MS = 300

function buildQuery(filters: ChatSearchFilters): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.tool) params.set('tool', filters.tool)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.paciente) params.set('paciente', filters.paciente)
  return params.toString()
}

function hasAnyFilter(filters: ChatSearchFilters): boolean {
  return !!(filters.q?.trim() || filters.tool || filters.from || filters.to || filters.paciente?.trim())
}

export function useChatSearch() {
  const [filters, setFilters] = useState<ChatSearchFilters>({})
  const [state, setState] = useState<State>({ results: [], loading: false, error: null })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runSearch = useCallback(async (f: ChatSearchFilters) => {
    if (!hasAnyFilter(f)) {
      setState({ results: [], loading: false, error: null })
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`/api/chat/conversations/search?${buildQuery(f)}`, {
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { results: ChatSearchResultRow[] } = await res.json()
      setState({ results: data.results, loading: false, error: null })
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setState({
        results: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Error',
      })
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(filters), DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [filters, runSearch])

  return {
    filters,
    setFilters,
    results: state.results,
    loading: state.loading,
    error: state.error,
    hasActiveSearch: hasAnyFilter(filters),
    clear: () => setFilters({}),
  }
}
