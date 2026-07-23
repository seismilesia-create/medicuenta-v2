import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CirugiaStatusBadge } from '@/features/cirugias/components'
import type { Cirugia, PracticaAdicional } from '@/features/cirugias/types/cirugias'
import { DeleteCirugiaButton, EstadoSelector } from './_components'

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata = { title: 'Detalle Cirugía | MediCuenta' }

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

export default async function CirugiaDetallePage({
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

  // Fetch cirugia (RLS ensures scoping)
  const { data: cirugia, error } = await supabase
    .from('cirugias')
    .select('*')
    .eq('id', id)
    .single()

  // ---- Not found / error state -----------------------------------------------
  if (error || !cirugia) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
        <div
          className="rounded-xl p-6 text-center space-y-4"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            No se encontró la cirugía solicitada o no tienes acceso a ella.
          </p>
          <Link
            href="/cirugias"
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-primary)' }}
          >
            &larr; Volver a Cirugías
          </Link>
        </div>
      </div>
    )
  }

  const c = cirugia as Cirugia
  const practicas = (c.practicas_adicionales ?? []) as PracticaAdicional[]
  const hasEquipo = c.ayudante || c.anestesiologo || c.instrumentador
  const hasAnestesia = c.tipo_anestesia || c.duracion_minutos || c.institucion || c.sala

  // ---- Main layout -----------------------------------------------------------
  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/cirugias"
            className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            &larr; Volver a Cirugías
          </Link>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-foreground)' }}
          >
            {c.nombre_paciente}
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 pt-1">
          <CirugiaStatusBadge estado={c.estado} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/cirugias/${id}/editar`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
          }}
        >
          Editar
        </Link>

        <DeleteCirugiaButton cirugiaId={id} />
      </div>

      {/* Cambiar estado */}
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
        <EstadoSelector cirugiaId={id} estadoActual={c.estado} />
      </section>

      {/* Informacion general */}
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
          Información general
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Fecha" value={formatFecha(c.fecha)} />
          <Field label="Obra Social" value={c.obra_social} />
          <Field label="Estado" value={<CirugiaStatusBadge estado={c.estado} />} />
        </dl>
      </section>

      {/* Practica principal */}
      <section
        className="rounded-xl p-5 md:p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-surface)' }}
        aria-labelledby="section-practica"
      >
        <h2
          id="section-practica"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Práctica principal
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Código" value={c.codigo_practica} />
          {c.nombre_practica && <Field label="Nombre" value={c.nombre_practica} />}
        </dl>
      </section>

      {/* Montos */}
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
          <Field label="Honorarios" value={ARS.format(Number(c.honorarios))} />
          <Field label="Gastos" value={ARS.format(Number(c.gastos))} />
          <Field label="Total práctica" value={ARS.format(Number(c.total))} />
          <div>
            <dt
              className="text-sm font-medium"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              Total calculado
            </dt>
            <dd
              className="mt-1 text-base font-semibold"
              style={{ color: 'var(--color-foreground)' }}
            >
              {ARS.format(Number(c.total_calculado))}
            </dd>
          </div>
        </dl>
      </section>

      {/* Equipo quirurgico (condicional) */}
      {hasEquipo && (
        <section
          className="rounded-xl p-5 md:p-6 space-y-4"
          style={{ backgroundColor: 'var(--color-surface)' }}
          aria-labelledby="section-equipo"
        >
          <h2
            id="section-equipo"
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Equipo quirurgico
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {c.ayudante && <Field label="Ayudante" value={c.ayudante} />}
            {c.anestesiologo && <Field label="Anestesiologo" value={c.anestesiologo} />}
            {c.instrumentador && <Field label="Instrumentador" value={c.instrumentador} />}
          </dl>
        </section>
      )}

      {/* Anestesia y lugar (condicional) */}
      {hasAnestesia && (
        <section
          className="rounded-xl p-5 md:p-6 space-y-4"
          style={{ backgroundColor: 'var(--color-surface)' }}
          aria-labelledby="section-anestesia"
        >
          <h2
            id="section-anestesia"
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Anestesia y lugar
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {c.tipo_anestesia && <Field label="Tipo de anestesia" value={c.tipo_anestesia} />}
            {c.duracion_minutos && <Field label="Duracion" value={`${c.duracion_minutos} minutos`} />}
            {c.institucion && <Field label="Institución" value={c.institucion} />}
            {c.sala && <Field label="Sala" value={c.sala} />}
          </dl>
        </section>
      )}

      {/* Practicas adicionales (condicional) */}
      {practicas.length > 0 && (
        <section
          className="rounded-xl p-5 md:p-6 space-y-4"
          style={{ backgroundColor: 'var(--color-surface)' }}
          aria-labelledby="section-adicionales"
        >
          <h2
            id="section-adicionales"
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Prácticas adicionales ({practicas.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th className="text-left py-2 font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Código</th>
                  <th className="text-left py-2 font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Detalle</th>
                  <th className="text-right py-2 font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Honorarios</th>
                  <th className="text-right py-2 font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Gastos</th>
                  <th className="text-right py-2 font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {practicas.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="py-2 font-mono" style={{ color: 'var(--color-foreground)' }}>{p.codigo}</td>
                    <td className="py-2" style={{ color: 'var(--color-foreground)' }}>{p.detalle}</td>
                    <td className="py-2 text-right font-mono" style={{ color: 'var(--color-foreground)' }}>{ARS.format(p.honorarios)}</td>
                    <td className="py-2 text-right font-mono" style={{ color: 'var(--color-foreground)' }}>{ARS.format(p.gastos)}</td>
                    <td className="py-2 text-right font-mono font-medium" style={{ color: 'var(--color-foreground)' }}>{ARS.format(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Observaciones (condicional) */}
      {c.observaciones && (
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
            {c.observaciones}
          </p>
        </section>
      )}
    </div>
  )
}
