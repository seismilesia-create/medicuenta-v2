import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EditarCirugiaForm } from '@/features/cirugias/components'
import type { Cirugia } from '@/features/cirugias/types/cirugias'

export const metadata = {
  title: 'Editar Cirugia | MediCuenta',
}

export default async function EditarCirugiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: cirugia, error } = await supabase
    .from('cirugias')
    .select('*')
    .eq('id', id)
    .eq('medico_id', user.id)
    .single()

  if (error || !cirugia) {
    notFound()
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/cirugias/${id}`}
          className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          &larr; Volver a la cirugia
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1
          className="text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: 'var(--color-foreground)' }}
        >
          Editar cirugia
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Modificando cirugia de {(cirugia as Cirugia).nombre_paciente}
        </p>
      </div>

      {/* Form */}
      <EditarCirugiaForm cirugia={cirugia as Cirugia} />
    </div>
  )
}
