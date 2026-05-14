import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EditarLiquidacionForm } from '@/features/liquidaciones/components'
import type { Liquidacion } from '@/features/liquidaciones/types/liquidaciones'

export const metadata = { title: 'Editar Liquidacion | MediCuenta' }

export default async function EditarLiquidacionPage({
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
    .eq('medico_id', user.id)
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

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href={`/liquidaciones/${id}`} className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70" style={{ color: 'var(--color-muted-foreground)' }}>
          &larr; Volver a la liquidacion
        </Link>
      </div>
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
          Editar liquidacion
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Modificando los datos de esta liquidacion
        </p>
      </div>
      <EditarLiquidacionForm liquidacion={liquidacion as Liquidacion} />
    </div>
  )
}
