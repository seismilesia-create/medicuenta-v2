'use client'

import { Search, Plus, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
            <Search className="h-4 w-4 text-violet-500" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Buscar practicas</h3>
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Buscar por codigo o nombre de practica..."
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none transition-colors"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* Results table */}
        {results.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Codigo</th>
                  <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Detalle</th>
                  <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Honorarios</th>
                  <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Gastos</th>
                  <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Total</th>
                  <th className="py-3 px-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => {
                  const alreadyAdded = items.some((i) => i.id === p.id)
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-mono text-xs font-bold text-primary">{p.codigo}</span>
                      </td>
                      <td className="py-3 px-3 text-foreground">
                        <span className="line-clamp-2">{p.detalle}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-muted-foreground hidden md:table-cell">
                        {formatMonto(p.honorarios)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-muted-foreground hidden md:table-cell">
                        {formatMonto(p.gastos)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs font-medium text-emerald-500">
                        {formatMonto(p.total)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => addItem(p)}
                          disabled={alreadyAdded}
                          className={cn(
                            'p-1.5 rounded-lg transition-colors disabled:cursor-not-allowed',
                            alreadyAdded ? 'text-muted-foreground bg-muted/50' : 'text-primary hover:bg-primary/10',
                          )}
                          title={alreadyAdded ? 'Ya agregada' : 'Agregar al calculador'}
                        >
                          {alreadyAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
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
          <p className="text-center py-8 text-sm text-muted-foreground">
            No se encontraron practicas para &quot;{query}&quot;
          </p>
        )}

        {query.length < 2 && (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Escribi al menos 2 caracteres para buscar
          </p>
        )}
      </div>
    </div>
  )
}
