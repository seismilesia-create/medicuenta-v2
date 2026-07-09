// src/app/admin/medicos/page.tsx
import Link from 'next/link'
import { listarMedicos, listarInvitaciones } from '@/actions/admin-medicos'
import { ListaMedicos } from '@/features/admin/medicos/components/ListaMedicos'
import { PanelInvitaciones } from '@/features/admin/medicos/components/PanelInvitaciones'

export const metadata = { title: 'Médicos | MediCuenta' }

export default async function AdminMedicosPage() {
  const [resMed, resInv] = await Promise.all([listarMedicos(), listarInvitaciones()])
  const medicos = 'data' in resMed ? resMed.data : []
  const error = 'error' in resMed ? resMed.error : null
  const invitaciones = 'data' in resInv ? resInv.data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Médicos</h1>
        <Link href="/admin/medicos/nuevo" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
          ＋ Nuevo médico (manual)
        </Link>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <PanelInvitaciones inicial={invitaciones} />
      <ListaMedicos medicos={medicos} />
    </div>
  )
}
