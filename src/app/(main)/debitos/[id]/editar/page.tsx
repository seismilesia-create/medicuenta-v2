import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EditarDebitoForm } from '@/features/debitos/components'
import type { Debito } from '@/features/debitos/types/debitos'

export const metadata = { title: 'Editar Debito | MediCuenta' }

export default async function EditarDebitoPage({
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
    .eq('medico_id', user.id)
    .single()

  if (error || !debito) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
        <div className="rounded-xl p-6 text-center space-y-4" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No se encontro el debito solicitado o no tienes acceso a el.
          </p>
          <Link href="/debitos" className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--color-primary)' }}>
            &larr; Volver a Debitos
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href={`/debitos/${id}`} className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70" style={{ color: 'var(--color-muted)' }}>
          &larr; Volver al debito
        </Link>
      </div>
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
          Editar debito
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted)' }}>
          Modificando los datos de este debito
        </p>
      </div>
      <EditarDebitoForm debito={debito as Debito} />
    </div>
  )
}
