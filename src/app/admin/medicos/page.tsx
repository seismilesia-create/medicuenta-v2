// src/app/admin/medicos/page.tsx
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
      <h1 className="text-xl font-semibold">Médicos</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <PanelInvitaciones inicial={invitaciones} />
      <ListaMedicos medicos={medicos} />
    </div>
  )
}
