// src/app/admin/medicos/page.tsx
import Link from 'next/link'
import { listarMedicos } from '@/actions/admin-medicos'
import { ListaMedicos } from '@/features/admin/medicos/components/ListaMedicos'

export const metadata = { title: 'Médicos | MediCuenta' }

export default async function AdminMedicosPage() {
  const res = await listarMedicos()
  const medicos = 'data' in res ? res.data : []
  const error = 'error' in res ? res.error : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Médicos</h1>
        <Link href="/admin/medicos/nuevo" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
          ＋ Nuevo médico
        </Link>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ListaMedicos medicos={medicos} />
    </div>
  )
}
