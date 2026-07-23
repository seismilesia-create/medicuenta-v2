'use client'

import { Calculator, BookOpen, X, Info, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCalculatorStore } from '../hooks/useCalculatorStore'

function formatMonto(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(valor)
}

export function NomencladorCalculator() {
  const items = useCalculatorStore((s) => s.items)
  const removeItem = useCalculatorStore((s) => s.removeItem)
  const clearItems = useCalculatorStore((s) => s.clearItems)
  const totalGeneral = useCalculatorStore((s) => s.totalGeneral)

  if (items.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Calculator className="h-4 w-4 text-violet-500" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Calculadora de prácticas</h3>
          </div>

          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl pulse-glow" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-violet-500/10 ring-1 ring-violet-500/20">
                <BookOpen className="h-8 w-8 text-violet-500" strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-sm font-medium text-foreground mb-2">Agrega prácticas desde el buscador</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Primera práctica: 100% honorarios + 100% gastos</p>
              <p>Siguientes: 50% honorarios + 100% gastos</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Calculator className="h-4 w-4 text-violet-500" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Calculadora de prácticas</h3>
          </div>
          <button
            onClick={clearItems}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpiar todo
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Código</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Detalle</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Honorarios</th>
                <th className="text-center py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">%</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Hon. Calc.</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Gastos</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Subtotal</th>
                <th className="py-3 px-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/50">
                  <td className="py-3 px-3">
                    <span className="font-mono text-xs font-bold text-primary">{item.codigo}</span>
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell">
                    <span className="line-clamp-1 text-xs text-foreground">{item.detalle}</span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                    {formatMonto(item.honorarios)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-[10px] font-bold',
                        item.porcentajeHonorarios === 100 ? 'bg-sky-500/15 text-sky-500' : 'bg-amber-500/15 text-amber-500',
                      )}
                    >
                      {item.porcentajeHonorarios}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs font-medium text-foreground">
                    {formatMonto(item.honorariosCalculados)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-foreground hidden md:table-cell">
                    {formatMonto(item.gastos)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs font-medium text-sky-500">
                    {formatMonto(item.subtotal)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Quitar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={6} className="py-4 px-3 text-right font-semibold text-foreground">
                  Total a cobrar:
                </td>
                <td className="py-4 px-3 text-right font-mono font-bold text-base text-sky-500">
                  {formatMonto(totalGeneral())}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-xl bg-muted/30">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-500" />
          <p>
            Regla OSEP: la práctica de mayor valor cobra 100% de honorarios. Las demás cobran 50%.
            Gastos se cobran al 100% en todas. Se auto-ordena por valor.
          </p>
        </div>
      </div>
    </div>
  )
}
