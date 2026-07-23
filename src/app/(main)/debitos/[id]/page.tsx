import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MotivoDebitoBadge } from '@/features/debitos/components'
import { MOTIVO_LABELS } from '@/features/debitos/types/debitos'
import type { Debito } from '@/features/debitos/types/debitos'
import { DeleteDebitoButton, RefacturadoToggle } from './_components'

export const metadata = { title: 'Detalle Debito | MediCuenta' }

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

export default async function DebitoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: debito, error } = await supabase
    .from('debitos')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !debito) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
        <div className="rounded-xl p-6 text-center space-y-4" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            No se encontro el debito solicitado o no tienes acceso a el.
          </p>
          <Link href="/debitos" className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--color-primary)' }}>
            &larr; Volver a Debitos
          </Link>
        </div>
      </div>
    )
  }

  const typed = debito as Debito

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link href="/debitos" className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70" style={{ color: 'var(--color-muted-foreground)' }}>
            &larr; Volver a Debitos
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            {MOTIVO_LABELS[typed.motivo]}
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 pt-1">
          <MotivoDebitoBadge motivo={typed.motivo} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/debitos/${id}/editar`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
        >
          Editar
        </Link>
        <DeleteDebitoButton debitoId={id} />
      </div>

      {/* Refacturacion */}
      <section className="rounded-xl p-5 md:p-6 space-y-3" style={{ backgroundColor: 'var(--color-surface)' }} aria-labelledby="section-refac">
        <h2 id="section-refac" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
          Refacturacion
        </h2>
        <RefacturadoToggle debitoId={id} refacturable={typed.refacturable} refacturado={typed.refacturado} />
      </section>

      {/* Informacion general */}
      <section className="rounded-xl p-5 md:p-6 space-y-4" style={{ backgroundColor: 'var(--color-surface)' }} aria-labelledby="section-general">
        <h2 id="section-general" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
          Información general
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Fecha" value={formatFecha(typed.fecha)} />
          <Field label="Motivo" value={<MotivoDebitoBadge motivo={typed.motivo} />} />
          <Field label="Detalle" value={typed.motivo_detalle ?? '-'} />
        </dl>
      </section>

      {/* Monto */}
      <section className="rounded-xl p-5 md:p-6 space-y-4" style={{ backgroundColor: 'var(--color-surface)' }} aria-labelledby="section-monto">
        <h2 id="section-monto" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
          Monto
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <dt className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Monto debitado</dt>
            <dd className="mt-1 text-base font-semibold" style={{ color: 'var(--color-error)' }}>
              {ARS.format(typed.monto)}
            </dd>
          </div>
          <Field label="Refacturable" value={typed.refacturable ? 'Sí' : 'No'} />
          <Field label="Refacturado" value={typed.refacturado ? 'Sí' : 'No'} />
        </dl>
      </section>
    </div>
  )
}
