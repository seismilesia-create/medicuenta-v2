import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EditarOrdenForm } from '@/features/ordenes/components/EditarOrdenForm'
import type { Orden } from '@/features/ordenes/types/ordenes'
import { getCobroVivoDeOrden } from '@/features/cobros/services/cobrosService'

export const metadata = {
  title: 'Editar Orden | MediCuenta',
}

export default async function EditarOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: orden, error } = await supabase
    .from('ordenes')
    .select('*')
    .eq('id', id)
    .eq('medico_id', user.id)
    .single()

  if (error || !orden) {
    notFound()
  }

  // Cobro vivo anclado a esta orden (para la tarjeta de plus: medio y bloqueo MP).
  const cobro = await getCobroVivoDeOrden(supabase, user.id, id)

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/ordenes/${id}`}
          className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Volver a la orden
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1
          className="text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: 'var(--color-foreground)' }}
        >
          Editar orden
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Modificando orden de {(orden as Orden).nombre_paciente}
        </p>
      </div>

      {/* Form */}
      <EditarOrdenForm
        orden={orden as Orden}
        cobroVinculado={
          cobro ? { id: cobro.id, monto: Number(cobro.monto), medio: cobro.medio, estado: cobro.estado } : null
        }
      />
    </div>
  )
}
