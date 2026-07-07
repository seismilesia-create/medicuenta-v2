import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { OrdenStatusBadge } from '@/features/ordenes/components'
import { ResolverFaltantesPanel } from '@/features/ordenes/components/ResolverFaltantesPanel'
import type { Orden } from '@/features/ordenes/types/ordenes'
import { evaluarCompletitud, CAMPO_FALTANTE_LABELS } from '@/lib/ordenes/completitud'
import { DeleteOrdenButton, EstadoSelector } from './_components'

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata = { title: 'Detalle Orden | MediCuenta' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function formatFecha(iso: string): string {
  // Append T00:00:00 to avoid UTC offset shifting the date
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function Field({
  label,
  value,
}: {
  label: string
  value: string | React.ReactNode
}) {
  return (
    <div>
      <dt
        className="text-sm font-medium"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        {label}
      </dt>
      <dd
        className="mt-1 text-sm"
        style={{ color: 'var(--color-foreground)' }}
      >
        {value}
      </dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OrdenDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()

  // Auth guard
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch orden (RLS ensures the medico only sees their own rows)
  const { data: orden, error } = await supabase
    .from('ordenes')
    .select('*')
    .eq('id', id)
    .single()

  // ---- Not found / error state -----------------------------------------------
  if (error || !orden) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
        <div
          className="rounded-xl p-6 text-center space-y-4"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            No se encontro la orden solicitada o no tienes acceso a ella.
          </p>
          <Link
            href="/ordenes"
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-primary)' }}
          >
            &larr; Volver a Ordenes
          </Link>
        </div>
      </div>
    )
  }

  const typedOrden = orden as Orden

  // Comprobante (foto): URL firmada temporal desde el bucket privado.
  let comprobanteUrl: string | null = null
  if (typedOrden.imagen_comprobante) {
    const { data: signed } = await supabase.storage
      .from('comprobantes')
      .createSignedUrl(typedOrden.imagen_comprobante, 3600)
    comprobanteUrl = signed?.signedUrl ?? null
  }

  const honorario = typedOrden.honorario_calculado ?? 0
  const particular = typedOrden.monto_particular ?? 0
  const plus = typedOrden.monto_plus ?? 0
  const total = honorario + particular + plus

  const { completa, faltantes } = evaluarCompletitud(typedOrden)

  // ---- Main layout -----------------------------------------------------------
  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">

      {/* ------------------------------------------------------------------
          Header
      ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/ordenes"
            className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            &larr; Volver a Ordenes
          </Link>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-foreground)' }}
          >
            {typedOrden.nombre_paciente}
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 pt-1">
          <OrdenStatusBadge estado={typedOrden.estado} />
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Incompleta (faltan datos para presentar)
      ------------------------------------------------------------------ */}
      {typedOrden.estado === 'borrador' && !completa && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}
        >
          <p className="font-medium" style={{ color: 'var(--color-warning)' }}>
            ⚠ Incompleta — faltan {faltantes.length} datos para presentar
          </p>
          <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
            {faltantes.map((f) => CAMPO_FALTANTE_LABELS[f]).join(', ')}
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------
          Action buttons
      ------------------------------------------------------------------ */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/ordenes/${id}/editar`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
          }}
        >
          Editar
        </Link>

        <DeleteOrdenButton ordenId={id} />
      </div>

      {/* ------------------------------------------------------------------
          Resolver faltantes (auto-hidden when not a draft-with-risk)
      ------------------------------------------------------------------ */}
      <ResolverFaltantesPanel orden={typedOrden} />

      {/* ------------------------------------------------------------------
          Cambiar estado
      ------------------------------------------------------------------ */}
      <section
        className="rounded-xl p-5 md:p-6 space-y-3"
        style={{ backgroundColor: 'var(--color-surface)' }}
        aria-labelledby="section-estado"
      >
        <h2
          id="section-estado"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Cambiar Estado
        </h2>
        <EstadoSelector ordenId={id} estadoActual={typedOrden.estado} />
      </section>

      {/* ------------------------------------------------------------------
          Informacion general
      ------------------------------------------------------------------ */}
      <section
        className="rounded-xl p-5 md:p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-surface)' }}
        aria-labelledby="section-general"
      >
        <h2
          id="section-general"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Informacion general
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="Fecha de atencion"
            value={formatFecha(typedOrden.fecha_atencion)}
          />
          <Field
            label="Tipo"
            value={typedOrden.tipo === 'obra_social' ? 'Obra Social' : 'Particular'}
          />
          <Field
            label="Estado"
            value={<OrdenStatusBadge estado={typedOrden.estado} />}
          />
        </dl>
      </section>

      {/* ------------------------------------------------------------------
          Datos del paciente
      ------------------------------------------------------------------ */}
      <section
        className="rounded-xl p-5 md:p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-surface)' }}
        aria-labelledby="section-paciente"
      >
        <h2
          id="section-paciente"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Datos del paciente
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Nombre del paciente"
            value={typedOrden.nombre_paciente}
          />

          {typedOrden.tipo === 'obra_social' && (
            <>
              <Field
                label="Obra social"
                value={typedOrden.obra_social ?? '-'}
              />
              <Field
                label="Nro afiliado"
                value={typedOrden.nro_afiliado ?? '-'}
              />
              {(typedOrden.codigo_os === 327 || typedOrden.obra_social === 'OSEP') && (
                <Field
                  label="Token OSEP"
                  value={typedOrden.token_osep ?? '-'}
                />
              )}
              <Field
                label="Firma paciente"
                value={typedOrden.firma_paciente ? 'Si' : 'No'}
              />
            </>
          )}
        </dl>
      </section>

      {/* ------------------------------------------------------------------
          Prestacion
      ------------------------------------------------------------------ */}
      <section
        className="rounded-xl p-5 md:p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-surface)' }}
        aria-labelledby="section-prestacion"
      >
        <h2
          id="section-prestacion"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Prestacion
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {typedOrden.codigo_practica && (
            <Field
              label="Codigo practica"
              value={typedOrden.codigo_practica}
            />
          )}
          {typedOrden.nombre_practica && (
            <Field
              label="Nombre practica"
              value={typedOrden.nombre_practica}
            />
          )}
          {typedOrden.diagnostico_cie10 && (
            <Field
              label="Diagnostico CIE-10"
              value={typedOrden.diagnostico_cie10}
            />
          )}
        </dl>
      </section>

      {/* ------------------------------------------------------------------
          Montos
      ------------------------------------------------------------------ */}
      <section
        className="rounded-xl p-5 md:p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-surface)' }}
        aria-labelledby="section-montos"
      >
        <h2
          id="section-montos"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Montos
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Honorario calculado" value={ARS.format(honorario)} />
          <Field label="Monto particular" value={ARS.format(particular)} />
          <Field label="Plus" value={ARS.format(plus)} />
          <div>
            <dt
              className="text-sm font-medium"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              Total
            </dt>
            <dd
              className="mt-1 text-base font-semibold"
              style={{ color: 'var(--color-foreground)' }}
            >
              {ARS.format(total)}
            </dd>
          </div>
        </dl>
      </section>

      {/* ------------------------------------------------------------------
          Comprobante (foto escaneada)
      ------------------------------------------------------------------ */}
      {comprobanteUrl && (
        <section
          className="rounded-xl p-5 md:p-6 space-y-3"
          style={{ backgroundColor: 'var(--color-surface)' }}
          aria-labelledby="section-comprobante"
        >
          <h2
            id="section-comprobante"
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Comprobante
          </h2>
          <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={comprobanteUrl}
              alt="Foto de la orden (comprobante)"
              className="max-h-96 w-auto rounded-lg border"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </a>
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Tocá la imagen para verla en grande.
          </p>
        </section>
      )}

      {/* ------------------------------------------------------------------
          Observaciones (conditional)
      ------------------------------------------------------------------ */}
      {typedOrden.observaciones && (
        <section
          className="rounded-xl p-5 md:p-6 space-y-3"
          style={{ backgroundColor: 'var(--color-surface)' }}
          aria-labelledby="section-obs"
        >
          <h2
            id="section-obs"
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Observaciones
          </h2>
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: 'var(--color-foreground)' }}
          >
            {typedOrden.observaciones}
          </p>
        </section>
      )}
    </div>
  )
}
