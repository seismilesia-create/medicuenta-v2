// src/app/admin/medicos/[id]/editar/page.tsx
import { getMedicoDetalle } from '@/actions/admin-medicos'
import { FormEditarMedico } from '@/features/admin/medicos/components/FormEditarMedico'

export const metadata = { title: 'Editar médico | MediCuenta' }

export default async function EditarMedicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getMedicoDetalle(id)
  if ('error' in res) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">Editar médico</h1>
        <p className="text-sm text-destructive">{res.error}</p>
        <a href="/admin/medicos" className="text-primary underline text-sm">← Volver a la lista</a>
      </div>
    )
  }
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Editar médico</h1>
      <FormEditarMedico medicoId={id} inicial={res.data} />
    </div>
  )
}
