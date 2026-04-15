import type { TablaMesRow } from '../types/reportes'
import { formatARS } from '../lib/format'

interface Props {
  rows: TablaMesRow[]
}

export function TablaComparativa12Meses({ rows }: Props) {
  const totales = rows.reduce(
    (acc, r) => ({
      facturado: acc.facturado + r.facturado,
      cobrado: acc.cobrado + r.cobrado,
      debitos: acc.debitos + r.debitos,
      plus: acc.plus + r.plus,
      neto: acc.neto + r.neto,
    }),
    { facturado: 0, cobrado: 0, debitos: 0, plus: 0, neto: 0 },
  )

  const hasData = totales.facturado > 0 || totales.cobrado > 0 || totales.debitos > 0 || totales.plus > 0

  return (
    <div className="rounded-xl p-5 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
        Tabla comparativa — últimos 12 meses
      </h3>
      {hasData ? (
        <div className="overflow-x-auto -mx-5 md:-mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                <Th>Mes</Th>
                <Th align="right">Facturado</Th>
                <Th align="right">Cobrado</Th>
                <Th align="right">Débitos</Th>
                <Th align="right">Plus 🔒</Th>
                <Th align="right">Neto</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <Td>{r.label}</Td>
                  <Td align="right" mono>{formatARS(r.facturado)}</Td>
                  <Td align="right" mono color="var(--color-success)">{formatARS(r.cobrado)}</Td>
                  <Td align="right" mono color="var(--color-error)">{formatARS(r.debitos)}</Td>
                  <Td align="right" mono color="var(--color-warning)">{formatARS(r.plus)}</Td>
                  <Td align="right" mono bold>{formatARS(r.neto)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <Td bold>Totales</Td>
                <Td align="right" mono bold>{formatARS(totales.facturado)}</Td>
                <Td align="right" mono bold color="var(--color-success)">{formatARS(totales.cobrado)}</Td>
                <Td align="right" mono bold color="var(--color-error)">{formatARS(totales.debitos)}</Td>
                <Td align="right" mono bold color="var(--color-warning)">{formatARS(totales.plus)}</Td>
                <Td align="right" mono bold>{formatARS(totales.neto)}</Td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-sm" style={{ color: 'var(--color-foreground-muted)' }}>
          Sin datos en los últimos 12 meses.
        </div>
      )}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th
      className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
      style={{ color: 'var(--color-foreground-muted)', textAlign: align ?? 'left' }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  mono,
  bold,
  color,
}: {
  children: React.ReactNode
  align?: 'right' | 'left'
  mono?: boolean
  bold?: boolean
  color?: string
}) {
  return (
    <td
      className={`px-4 py-2 ${mono ? 'font-mono' : ''} ${bold ? 'font-semibold' : ''}`}
      style={{ color: color ?? 'var(--color-foreground)', textAlign: align ?? 'left' }}
    >
      {children}
    </td>
  )
}
