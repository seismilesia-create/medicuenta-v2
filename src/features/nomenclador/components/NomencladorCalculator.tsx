'use client'

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
      <div
        className="rounded-xl p-4 md:p-6"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
          Calculadora de practicas
        </h2>
        <div className="text-center py-8">
          <svg
            className="w-12 h-12 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: 'var(--color-muted)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Agrega practicas desde el buscador para calcular el total
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>
            Primera practica: 100% honorarios + 100% gastos
          </p>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Siguientes: 50% honorarios + 100% gastos
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl p-4 md:p-6"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Calculadora de practicas
        </h2>
        <button
          onClick={clearItems}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          style={{ color: 'var(--color-error)' }}
        >
          Limpiar todo
        </button>
      </div>

      {/* Calculator table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Codigo</th>
              <th className="text-left py-2 px-2 font-medium hidden md:table-cell" style={{ color: 'var(--color-muted)' }}>Detalle</th>
              <th className="text-right py-2 px-2 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>Honorarios</th>
              <th className="text-center py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>%</th>
              <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Hon. Calc.</th>
              <th className="text-right py-2 px-2 font-medium hidden md:table-cell" style={{ color: 'var(--color-muted)' }}>Gastos</th>
              <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Subtotal</th>
              <th className="py-2 px-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <td className="py-2.5 px-2">
                  <span className="font-mono text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                    {item.codigo}
                  </span>
                </td>
                <td className="py-2.5 px-2 hidden md:table-cell">
                  <span className="line-clamp-1 text-xs" style={{ color: 'var(--color-foreground)' }}>
                    {item.detalle}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono text-xs hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>
                  {formatMonto(item.honorarios)}
                </td>
                <td className="py-2.5 px-2 text-center">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: item.porcentajeHonorarios === 100
                        ? 'var(--color-success-bg, rgba(34,197,94,0.1))'
                        : 'var(--color-warning-bg, rgba(234,179,8,0.1))',
                      color: item.porcentajeHonorarios === 100
                        ? 'var(--color-success)'
                        : 'var(--color-warning)',
                    }}
                  >
                    {item.porcentajeHonorarios}%
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
                  {formatMonto(item.honorariosCalculados)}
                </td>
                <td className="py-2.5 px-2 text-right font-mono text-xs hidden md:table-cell" style={{ color: 'var(--color-foreground)' }}>
                  {formatMonto(item.gastos)}
                </td>
                <td className="py-2.5 px-2 text-right font-mono text-xs font-medium" style={{ color: 'var(--color-success)' }}>
                  {formatMonto(item.subtotal)}
                </td>
                <td className="py-2.5 px-2 text-center">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1 rounded transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    style={{ color: 'var(--color-error)' }}
                    title="Quitar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--color-border)' }}>
              <td
                colSpan={6}
                className="py-3 px-2 text-right font-semibold"
                style={{ color: 'var(--color-foreground)' }}
              >
                Total a cobrar:
              </td>
              <td className="py-3 px-2 text-right font-mono font-bold text-base" style={{ color: 'var(--color-success)' }}>
                {formatMonto(totalGeneral())}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Info */}
      <div className="mt-4 flex items-start gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>
          Regla OSEP: la practica de mayor valor cobra 100% de honorarios. Las demas cobran 50%.
          Gastos se cobran al 100% en todas. Se auto-ordena por valor.
        </p>
      </div>
    </div>
  )
}
