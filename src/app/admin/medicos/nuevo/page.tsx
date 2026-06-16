// src/app/admin/medicos/nuevo/page.tsx
import { FormNuevoMedico } from '@/features/admin/medicos/components/FormNuevoMedico'

export const metadata = { title: 'Nuevo médico | MediCuenta' }

export default function NuevoMedicoPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Nuevo médico</h1>
      <FormNuevoMedico />
    </div>
  )
}
