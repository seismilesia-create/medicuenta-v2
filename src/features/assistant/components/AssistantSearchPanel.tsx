'use client'

import type { ChatSearchFilters, ChatSearchResultRow } from '../types/chat-history'

interface Props {
  filters: ChatSearchFilters
  setFilters: (f: ChatSearchFilters) => void
  results: ChatSearchResultRow[]
  loading: boolean
  error: string | null
  onResultClick: (conversationId: string, messageId: string) => void
  onClear: () => void
}

const TOOL_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'registrar_orden', label: '📋 Órdenes' },
  { value: 'registrar_cirugia', label: '🩺 Cirugías' },
  { value: 'registrar_debito', label: '💸 Débitos' },
  { value: 'consultar_nomenclador', label: '📖 Nomenclador' },
  { value: 'analizar_imagen_orden', label: '📷 OCR imagen' },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function recordHref(r: ChatSearchResultRow): string | null {
  if (r.orden_id) return `/ordenes/${r.orden_id}`
  if (r.cirugia_id) return `/cirugias/${r.cirugia_id}`
  if (r.debito_id) return `/debitos/${r.debito_id}`
  return null
}

export function AssistantSearchPanel({
  filters,
  setFilters,
  results,
  loading,
  error,
  onResultClick,
  onClear,
}: Props) {
  return (
    <div className="p-3 space-y-2 overflow-y-auto" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex gap-1 items-center">
        <input
          type="text"
          value={filters.q ?? ''}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Buscar paciente, OS, código…"
          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] px-2 py-1 rounded transition-opacity disabled:opacity-30"
          disabled={!filters.q && !filters.tool && !filters.paciente && !filters.from && !filters.to}
          style={{ color: 'var(--color-muted)' }}
        >
          Limpiar
        </button>
      </div>

      <div className="flex gap-1 flex-wrap">
        <select
          value={filters.tool ?? ''}
          onChange={(e) => setFilters({ ...filters, tool: e.target.value || undefined })}
          className="text-[11px] px-2 py-1 rounded-lg flex-1 min-w-[120px]"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        >
          {TOOL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={filters.paciente ?? ''}
          onChange={(e) => setFilters({ ...filters, paciente: e.target.value || undefined })}
          placeholder="Paciente"
          className="text-[11px] px-2 py-1 rounded-lg flex-1 min-w-[80px]"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
      </div>

      <div className="flex gap-1">
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })}
          className="text-[11px] px-2 py-1 rounded-lg flex-1"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })}
          className="text-[11px] px-2 py-1 rounded-lg flex-1"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
      </div>

      {loading && (
        <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
          Buscando...
        </p>
      )}

      {error && (
        <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      )}

      {!loading && results.length > 0 && (
        <ul className="space-y-1">
          {results.map((r) => {
            const href = recordHref(r)
            return (
              <li key={r.message_id}>
                <button
                  type="button"
                  onClick={() => onResultClick(r.conversacion_id, r.message_id)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  <div
                    className="flex justify-between gap-2 mb-0.5"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    <span className="text-[10px] truncate">{r.titulo_auto}</span>
                    <span className="text-[10px] shrink-0">{formatDate(r.created_at)}</span>
                  </div>
                  <p
                    className="text-[11px] leading-snug"
                    style={{ color: 'var(--color-foreground)' }}
                    dangerouslySetInnerHTML={{ __html: r.snippet_html || '...' }}
                  />
                  {href && (
                    <span
                      className="inline-block mt-1 text-[10px]"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      → Ver registro
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
