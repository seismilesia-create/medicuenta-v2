'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { ChatConversacion } from '../types/chat-history'

type Group = { label: string; items: ChatConversacion[] }

interface Props {
  conversations: ChatConversacion[]
  activeId: string | null
  loading: boolean
  hasMore: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => Promise<void>
  onLoadMore: () => void
  searchSlot?: ReactNode
  showList?: boolean
}

const DAY_MS = 86_400_000

function groupConversations(items: ChatConversacion[]): Group[] {
  const now = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startOfToday = today.getTime()
  const startOfYesterday = startOfToday - DAY_MS
  const sevenDaysAgo = now - 7 * DAY_MS
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime()

  const groups: Record<string, ChatConversacion[]> = {
    Hoy: [],
    Ayer: [],
    'Últimos 7 días': [],
    'Este mes': [],
    Anteriores: [],
  }

  for (const c of items) {
    const t = new Date(c.last_message_at).getTime()
    if (t >= startOfToday) groups['Hoy'].push(c)
    else if (t >= startOfYesterday) groups['Ayer'].push(c)
    else if (t >= sevenDaysAgo) groups['Últimos 7 días'].push(c)
    else if (t >= startOfMonth) groups['Este mes'].push(c)
    else groups['Anteriores'].push(c)
  }

  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, arr]) => ({ label, items: arr }))
}

export function AssistantSidebar({
  conversations,
  activeId,
  loading,
  hasMore,
  onSelect,
  onNew,
  onDelete,
  onLoadMore,
  searchSlot,
  showList = true,
}: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const groups = useMemo(() => groupConversations(conversations), [conversations])

  async function handleDelete(id: string) {
    await onDelete(id)
    setConfirmId(null)
  }

  return (
    <aside
      className="flex flex-col h-full"
      style={{ borderRight: '1px solid var(--color-border)', backgroundColor: 'var(--color-background)' }}
    >
      <div className="p-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button
          type="button"
          onClick={onNew}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          + Nueva conversación
        </button>
      </div>

      {searchSlot}

      <div className="flex-1 overflow-y-auto" style={{ display: showList ? undefined : 'none' }}>
        {loading && conversations.length === 0 && (
          <p className="p-4 text-xs" style={{ color: 'var(--color-muted)' }}>
            Cargando...
          </p>
        )}

        {!loading && conversations.length === 0 && (
          <p className="p-4 text-xs" style={{ color: 'var(--color-muted)' }}>
            Sin conversaciones todavía. Empezá una.
          </p>
        )}

        {groups.map((g) => (
          <section key={g.label} className="py-1">
            <h3
              className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: 'var(--color-muted)' }}
            >
              {g.label}
            </h3>
            <ul>
              {g.items.map((c) => (
                <li key={c.id}>
                  <div
                    className={`group flex items-center gap-1 px-3 py-2 cursor-pointer transition-colors ${
                      activeId === c.id ? '' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    }`}
                    style={{
                      backgroundColor: activeId === c.id ? 'var(--color-surface)' : 'transparent',
                      borderLeft:
                        activeId === c.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                    onClick={() => onSelect(c.id)}
                  >
                    <span
                      className="flex-1 text-sm truncate"
                      style={{ color: 'var(--color-foreground)' }}
                      title={c.titulo_auto}
                    >
                      {c.titulo_auto}
                    </span>
                    {confirmId === c.id ? (
                      <span className="flex gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(c.id)
                          }}
                          className="px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
                        >
                          Borrar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmId(null)
                          }}
                          className="px-1.5 py-0.5 rounded"
                          style={{ border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmId(c.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
                        aria-label="Borrar conversación"
                        title="Borrar"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          style={{ color: 'var(--color-muted)' }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {hasMore && (
          <div className="p-2 text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
              style={{ border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
            >
              {loading ? 'Cargando...' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
