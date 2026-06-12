import { redirect } from 'next/navigation'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { ConfigView } from '@/features/consultorio/components/config/config-view'

export const metadata = {
  title: 'Asistente de turnos | MediCuenta',
}

export default async function ConfigPage() {
  const r = await resolverConsultorio()
  if (!r) redirect('/login')
  // Config = médico-only (spec §8): la secretaria (o un médico operando otro consultorio) no entra.
  if (!esDueño(r.ctx)) redirect('/agenda')
  return <ConfigView medicoId={r.ctx.userId} />
}
