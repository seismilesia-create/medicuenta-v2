import { Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Table2 className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Tabla comparativa - ultimos 12 meses</h3>
        </div>

        {hasData ? (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th>Mes</Th>
                  <Th align="right">Facturado</Th>
                  <Th align="right">Cobrado</Th>
                  <Th align="right">Debitos</Th>
                  <Th align="right">Plus</Th>
                  <Th align="right">Neto</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <Td>{r.label}</Td>
                    <Td align="right" mono>{formatARS(r.facturado)}</Td>
                    <Td align="right" mono colorClass="text-sky-500">{formatARS(r.cobrado)}</Td>
                    <Td align="right" mono colorClass="text-red-500">{formatARS(r.debitos)}</Td>
                    <Td align="right" mono colorClass="text-amber-500">{formatARS(r.plus)}</Td>
                    <Td align="right" mono bold>{formatARS(r.neto)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <Td bold>Totales</Td>
                  <Td align="right" mono bold>{formatARS(totales.facturado)}</Td>
                  <Td align="right" mono bold colorClass="text-sky-500">{formatARS(totales.cobrado)}</Td>
                  <Td align="right" mono bold colorClass="text-red-500">{formatARS(totales.debitos)}</Td>
                  <Td align="right" mono bold colorClass="text-amber-500">{formatARS(totales.plus)}</Td>
                  <Td align="right" mono bold>{formatARS(totales.neto)}</Td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
            Sin datos en los ultimos 12 meses.
          </div>
        )}
      </div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th
      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      style={{ textAlign: align ?? 'left' }}
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
  colorClass,
}: {
  children: React.ReactNode
  align?: 'right' | 'left'
  mono?: boolean
  bold?: boolean
  colorClass?: string
}) {
  return (
    <td
      className={cn('px-4 py-3', mono && 'font-mono', bold && 'font-semibold', colorClass ?? 'text-foreground')}
      style={{ textAlign: align ?? 'left' }}
    >
      {children}
    </td>
  )
}
