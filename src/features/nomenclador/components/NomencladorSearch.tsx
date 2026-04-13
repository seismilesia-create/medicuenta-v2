'use client'

import { useNomencladorSearch } from '../hooks/useNomencladorSearch'
import { useCalculatorStore } from '../hooks/useCalculatorStore'

function formatMonto(valor: number | null): string {
  if (!valor) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(valor)
}

export function NomencladorSearch() {
  const { query, results, loading, search } = useNomencladorSearch()
  const addItem = useCalculatorStore((s) => s.addItem)
  const items = useCalculatorStore((s) => s.items)

  return (
    <div
      className="rounded-xl p-4 md:p-6"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
        Buscar practicas
      </h2>

      {/* Search input */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          style={{ color: 'var(--color-muted)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Buscar por codigo o nombre de practica..."
          className="w-full pl-10 pr-4 py-3 rounded-lg text-sm"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
          </div>
        )}
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Codigo</th>
                <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Detalle</th>
                <th className="text-right py-2 px-2 font-medium hidden md:table-cell" style={{ color: 'var(--color-muted)' }}>Honorarios</th>
                <th className="text-right py-2 px-2 font-medium hidden md:table-cell" style={{ color: 'var(--color-muted)' }}>Gastos</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Total</th>
                <th className="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((p) => {
                const alreadyAdded = items.some((i) => i.id === p.id)
                return (
                  <tr
                    key={p.id}
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 px-2">
                      <span className="font-mono text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                        {p.codigo}
                      </span>
                    </td>
                    <td className="py-2.5 px-2" style={{ color: 'var(--color-foreground)' }}>
                      <span className="line-clamp-2">{p.detalle}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-xs hidden md:table-cell" style={{ color: 'var(--color-foreground)' }}>
                      {formatMonto(p.honorarios)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-xs hidden md:table-cell" style={{ color: 'var(--color-foreground)' }}>
                      {formatMonto(p.gastos)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-xs font-medium" style={{ color: 'var(--color-success)' }}>
                      {formatMonto(p.total)}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => addItem(p)}
                        disabled={alreadyAdded}
                        className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                        style={{
                          color: alreadyAdded ? 'var(--color-muted)' : 'var(--color-primary)',
                        }}
                        title={alreadyAdded ? 'Ya agregada' : 'Agregar al calculador'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {alreadyAdded ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          )}
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {query.length >= 2 && !loading && results.length === 0 && (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--color-muted)' }}>
          No se encontraron practicas para &quot;{query}&quot;
        </p>
      )}

      {query.length < 2 && (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--color-muted)' }}>
          Escribi al menos 2 caracteres para buscar
        </p>
      )}
    </div>
  )
}
