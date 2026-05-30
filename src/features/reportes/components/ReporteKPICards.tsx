import { FileText, CheckCircle2, AlertTriangle, Wallet, Clock, Users } from 'lucide-react'
import type { ReporteKPIs } from '../types/reportes'
import { formatARS } from '../lib/format'
import { AGENTE_LABELS } from '@/features/ordenes/types/ordenes'
import { MetricCard } from '@/features/dashboard/components/MetricCard'

interface Props {
  kpis: ReporteKPIs
}

export function ReporteKPICards({ kpis }: Props) {
  const alertaSinLiquidar = kpis.cirugias2doSinLiquidar.count > 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      <MetricCard
        title="Facturado"
        value={formatARS(kpis.facturado)}
        icon={FileText}
        variant="info"
        description="Total presentado en el periodo"
      />
      <MetricCard
        title="Cobrado (aprobado)"
        value={formatARS(kpis.cobrado)}
        icon={CheckCircle2}
        variant="success"
        description="Pagos confirmados"
      />
      <MetricCard
        title="Debitos"
        value={formatARS(kpis.debitos)}
        icon={AlertTriangle}
        variant="danger"
        description="Descuentos aplicados"
      />
      <MetricCard
        title="Plus cobrado"
        value={formatARS(kpis.plus)}
        icon={Wallet}
        variant="warning"
        description="Ingresos adicionales privados"
      />

      {/* Surgery status card */}
      <div
        className={`relative overflow-hidden rounded-2xl border bg-card p-6 ${
          alertaSinLiquidar ? 'border-red-500/20' : 'border-sky-500/20'
        }`}
      >
        <div
          className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl ${
            alertaSinLiquidar ? 'bg-red-500/10' : 'bg-sky-500/10'
          }`}
        />
        <div className="relative flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Cirugias 2° sin liquidar +90d</p>
            <p className={`text-2xl font-bold tracking-tight ${alertaSinLiquidar ? 'text-red-500' : 'text-sky-500'}`}>
              {kpis.cirugias2doSinLiquidar.count === 0
                ? 'Todo al dia'
                : `${kpis.cirugias2doSinLiquidar.count} · ${formatARS(kpis.cirugias2doSinLiquidar.monto)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {alertaSinLiquidar ? 'Atencion requerida' : 'Sin cirugias pendientes'}
            </p>
          </div>
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              alertaSinLiquidar ? 'bg-red-500/15' : 'bg-sky-500/15'
            }`}
          >
            <Clock className={`h-6 w-6 ${alertaSinLiquidar ? 'text-red-500' : 'text-sky-500'}`} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Discounts by agent */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
        <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Users className="h-4 w-4 text-amber-500" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Descuento por agente</h4>
          </div>
          <div className="space-y-3">
            <AgenteRow label={AGENTE_LABELS.circulo_medico} value={kpis.descuentoPorAgente.circulo_medico} />
            <AgenteRow label={AGENTE_LABELS.medical_group} value={kpis.descuentoPorAgente.medical_group} />
            <AgenteRow label={AGENTE_LABELS.comunidad} value={kpis.descuentoPorAgente.comunidad} />
          </div>
        </div>
      </div>
    </div>
  )
}

function AgenteRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-sm font-mono font-medium text-muted-foreground">{formatARS(value)}</span>
    </div>
  )
}
