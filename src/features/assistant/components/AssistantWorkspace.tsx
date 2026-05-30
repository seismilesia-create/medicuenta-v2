'use client'

import { useCallback, useState } from 'react'
import { AssistantPanel } from './AssistantPanel'
import { AssistantSidebar } from './AssistantSidebar'
import { AssistantSearchPanel } from './AssistantSearchPanel'
import { useConversations } from '../hooks/useConversations'
import { useConversationMessages } from '../hooks/useConversationMessages'
import { useChatSearch } from '../hooks/useChatSearch'

export function AssistantWorkspace() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const conversations = useConversations()
  const { messages: initialMessages, loading: loadingMessages } = useConversationMessages(activeId)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const search = useChatSearch()

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    setHighlightMessageId(null)
    setSidebarOpen(false)
  }, [])

  const handleNew = useCallback(() => {
    setActiveId(null)
    setHighlightMessageId(null)
    setSidebarOpen(false)
  }, [])

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await conversations.remove(id)
      if (ok && activeId === id) setActiveId(null)
    },
    [conversations, activeId],
  )

  const handleConversationCreated = useCallback(
    (id: string) => {
      setActiveId(id)
      conversations.reload()
    },
    [conversations],
  )

  const handleSearchResultClick = useCallback((conversationId: string, messageId: string) => {
    setActiveId(conversationId)
    setHighlightMessageId(messageId)
    setSidebarOpen(false)
  }, [])

  const panelKey = activeId ?? 'new'
  const showInitial = activeId !== null && !loadingMessages

  return (
    <div className="flex h-full overflow-hidden">
      <button
        type="button"
        onClick={() => setSidebarOpen((s) => !s)}
        className="md:hidden fixed top-3 left-3 z-30 p-2 rounded-lg shadow-sm"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        aria-label="Conversaciones"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-foreground)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div
        className={`absolute md:static z-20 h-full w-72 md:w-72 transition-transform md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AssistantSidebar
          conversations={conversations.items}
          activeId={activeId}
          loading={conversations.loading}
          hasMore={!!conversations.nextCursor}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onLoadMore={conversations.loadMore}
          showList={!search.hasActiveSearch}
          searchSlot={
            <AssistantSearchPanel
              filters={search.filters}
              setFilters={search.setFilters}
              results={search.results}
              loading={search.loading}
              error={search.error}
              onResultClick={handleSearchResultClick}
              onClear={search.clear}
            />
          }
        />
      </div>

      <div className="flex-1 min-w-0 h-full">
        {loadingMessages && activeId ? (
          <div className="h-full flex items-center justify-center text-xs" style={{ color: 'var(--color-muted)' }}>
            Cargando conversación...
          </div>
        ) : (
          <AssistantPanel
            key={panelKey}
            variant="fullscreen"
            initialConversationId={activeId ?? undefined}
            initialMessages={showInitial ? initialMessages : undefined}
            highlightMessageId={highlightMessageId}
            onConversationCreated={handleConversationCreated}
          />
        )}
      </div>
    </div>
  )
}
