import { redirect } from 'next/navigation'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { ConfigView } from '@/features/consultorio/components/config/config-view'

export const metadata = {
  title: 'Asistente de turnos | MediCuenta',
}

export default async function ConfigPage() {
  const r = await resolverConsultorio()
  if (!r) redirect('/login')
  if (r.ctx.plan !== 'full') redirect('/dashboard') // candado §3: consultorio = Full
  // Config operativa: entra el médico dueño O la secretaria vinculada. Sin vínculo activo → afuera.
  if (!r.ctx.medicoActivoId) redirect('/agenda')
  return <ConfigView esDueño={esDueño(r.ctx)} />
}
