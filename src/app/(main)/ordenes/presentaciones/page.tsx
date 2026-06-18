import Link from 'next/link'
import { getPresentaciones } from '@/actions/presentaciones'
import { AGENTE_LABELS } from '@/features/ordenes/types/ordenes'
import type { AgenteFacturador, Presentacion } from '@/features/ordenes/types/ordenes'

export const metadata = { title: 'Presentaciones | MediCuenta' }

function fmtMes(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
function fmtMonto(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function PresentacionesPage() {
  const res = await getPresentaciones()
  const presentaciones: Presentacion[] = 'presentaciones' in res ? (res.presentaciones ?? []) : []

  return (
    <div className="px-4 md:px-8 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Presentaciones</h1>
      {presentaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no emitiste ninguna planilla.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3">Obra social</th>
                <th className="px-4 py-3">Agente</th>
                <th className="px-4 py-3 text-right">Órdenes</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {presentaciones.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="px-4 py-3 text-foreground capitalize">{fmtMes(p.periodo_mes)}</td>
                  <td className="px-4 py-3 text-foreground">{p.obra_social}</td>
                  <td className="px-4 py-3 text-muted-foreground">{AGENTE_LABELS[p.agente_facturador as AgenteFacturador] ?? p.agente_facturador}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.cantidad_ordenes}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMonto(Number(p.monto_total))}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/imprimir/presentacion/${p.id}`} target="_blank" className="text-primary hover:underline">Imprimir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
