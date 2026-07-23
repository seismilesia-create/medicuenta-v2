import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LiquidacionStatusBadge } from '@/features/liquidaciones/components'
import type { Liquidacion } from '@/features/liquidaciones/types/liquidaciones'
import { DeleteLiquidacionButton, EstadoLiquidacionSelector } from './_components'

export const metadata = { title: 'Detalle Liquidacion | MediCuenta' }

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function formatFecha(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function Field({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)' }}>{label}</dt>
      <dd className="mt-1 text-sm" style={{ color: 'var(--color-foreground)' }}>{value}</dd>
    </div>
  )
}

export default async function LiquidacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: liquidacion, error } = await supabase
    .from('liquidaciones')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !liquidacion) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
        <div className="rounded-xl p-6 text-center space-y-4" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            No se encontro la liquidacion solicitada o no tienes acceso a ella.
          </p>
          <Link href="/liquidaciones" className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--color-primary)' }}>
            &larr; Volver a Liquidaciones
          </Link>
        </div>
      </div>
    )
  }

  const typed = liquidacion as Liquidacion
  const diferencia = typed.monto_liquidado - typed.monto_presentado

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link href="/liquidaciones" className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70" style={{ color: 'var(--color-muted-foreground)' }}>
            &larr; Volver a Liquidaciones
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            {formatFecha(typed.periodo_inicio)} - {formatFecha(typed.periodo_fin)}
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 pt-1">
          <LiquidacionStatusBadge estado={typed.estado} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/liquidaciones/${id}/editar`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
        >
          Editar
        </Link>
        <DeleteLiquidacionButton liquidacionId={id} />
      </div>

      {/* Cambiar estado */}
      <section className="rounded-xl p-5 md:p-6 space-y-3" style={{ backgroundColor: 'var(--color-surface)' }} aria-labelledby="section-estado">
        <h2 id="section-estado" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
          Cambiar Estado
        </h2>
        <EstadoLiquidacionSelector liquidacionId={id} estadoActual={typed.estado} />
      </section>

      {/* Informacion general */}
      <section className="rounded-xl p-5 md:p-6 space-y-4" style={{ backgroundColor: 'var(--color-surface)' }} aria-labelledby="section-general">
        <h2 id="section-general" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
          Información general
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Periodo inicio" value={formatFecha(typed.periodo_inicio)} />
          <Field label="Periodo fin" value={formatFecha(typed.periodo_fin)} />
          <Field label="Obra social" value={typed.obra_social ?? 'Todas'} />
        </dl>
      </section>

      {/* Montos */}
      <section className="rounded-xl p-5 md:p-6 space-y-4" style={{ backgroundColor: 'var(--color-surface)' }} aria-labelledby="section-montos">
        <h2 id="section-montos" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
          Montos
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Presentado" value={ARS.format(typed.monto_presentado)} />
          <Field label="Liquidado" value={ARS.format(typed.monto_liquidado)} />
          <Field label="Debitado" value={ARS.format(typed.monto_debitado)} />
          <div>
            <dt className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Diferencia</dt>
            <dd className="mt-1 text-sm font-semibold" style={{ color: diferencia >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
              {ARS.format(diferencia)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Observaciones */}
      {typed.observaciones && (
        <section className="rounded-xl p-5 md:p-6 space-y-3" style={{ backgroundColor: 'var(--color-surface)' }} aria-labelledby="section-obs">
          <h2 id="section-obs" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
            Observaciones
          </h2>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-foreground)' }}>
            {typed.observaciones}
          </p>
        </section>
      )}
    </div>
  )
}
