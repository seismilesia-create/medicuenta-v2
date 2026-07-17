import { redirect } from 'next/navigation'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { PacientesView } from '@/features/consultorio/components/pacientes/pacientes-view'
import { SinConsultorio } from '@/features/consultorio/components/sin-consultorio'

export const metadata = {
  title: 'Pacientes | MediCuenta',
}

export default async function PacientesPage() {
  const r = await resolverConsultorio()
  if (!r) redirect('/login')
  if (r.ctx.acceso.acceso === 'bloqueado') redirect('/plan') // candado F4.3 §5: suscripción
  if (r.ctx.plan !== 'full') redirect('/dashboard') // candado §3: consultorio = Full
  if (!r.ctx.medicoActivoId) return <SinConsultorio />
  // Recetas en la ficha: SOLO el médico dueño (spec §7) — jamás la secretaria.
  return <PacientesView medicoId={r.ctx.medicoActivoId} puedeVerRecetas={esDueño(r.ctx)} />
}
