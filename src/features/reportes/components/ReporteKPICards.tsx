import type { ReporteKPIs } from '../types/reportes'
import { formatARS } from '../lib/format'
import { AGENTE_LABELS } from '@/features/ordenes/types/ordenes'

interface Props {
  kpis: ReporteKPIs
}

export function ReporteKPICards({ kpis }: Props) {
  const alertaSinLiquidar = kpis.cirugias2doSinLiquidar.count > 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <KPICard
        label="Facturado"
        value={formatARS(kpis.facturado)}
        color="var(--color-info)"
        bgColor="var(--color-info-light)"
        icon={<IconDoc />}
      />
      <KPICard
        label="Cobrado (aprobado)"
        value={formatARS(kpis.cobrado)}
        color="var(--color-success)"
        bgColor="var(--color-success-light)"
        icon={<IconCheck />}
      />
      <KPICard
        label="Débitos"
        value={formatARS(kpis.debitos)}
        color="var(--color-error)"
        bgColor="var(--color-error-light)"
        icon={<IconWarning />}
      />
      <KPICard
        label="Plus cobrado"
        badge="🔒 Privado"
        value={formatARS(kpis.plus)}
        color="var(--color-warning)"
        bgColor="var(--color-warning-light)"
        icon={<IconWallet />}
      />
      <KPICard
        label="Cirugías 2° sin liquidar >30d"
        value={
          kpis.cirugias2doSinLiquidar.count === 0
            ? 'Todo al día'
            : `${kpis.cirugias2doSinLiquidar.count} · ${formatARS(kpis.cirugias2doSinLiquidar.monto)}`
        }
        color={alertaSinLiquidar ? 'var(--color-error)' : 'var(--color-success)'}
        bgColor={alertaSinLiquidar ? 'var(--color-error-light)' : 'var(--color-success-light)'}
        icon={<IconAlert />}
      />
      <div
        className="rounded-xl p-5 md:p-6"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <p className="text-sm font-medium mb-3" style={{ color: 'var(--color-foreground-secondary)' }}>
          Descuento por agente
        </p>
        <div className="space-y-2">
          <AgenteRow label={AGENTE_LABELS.circulo_medico} value={kpis.descuentoPorAgente.circulo_medico} />
          <AgenteRow label={AGENTE_LABELS.medical_group} value={kpis.descuentoPorAgente.medical_group} />
          <AgenteRow label={AGENTE_LABELS.comunidad} value={kpis.descuentoPorAgente.comunidad} />
        </div>
      </div>
    </div>
  )
}

function KPICard({
  label,
  value,
  color,
  bgColor,
  icon,
  badge,
}: {
  label: string
  value: string
  color: string
  bgColor: string
  icon: React.ReactNode
  badge?: string
}) {
  return (
    <div className="rounded-xl p-5 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ backgroundColor: bgColor, color }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground-secondary)' }}>{label}</p>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-xl md:text-2xl font-semibold tracking-tight truncate" style={{ color }}>{value}</p>
        </div>
      </div>
    </div>
  )
}

function AgenteRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--color-foreground-secondary)' }}>{label}</span>
      <span className="font-mono font-medium" style={{ color: 'var(--color-foreground)' }}>{formatARS(value)}</span>
    </div>
  )
}

function IconDoc() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function IconWarning() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function IconWallet() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M9 12h12m0 0l-3-3m3 3l-3 3" />
    </svg>
  )
}

function IconAlert() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
