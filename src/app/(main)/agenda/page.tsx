import { redirect } from 'next/navigation'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { AgendaView } from '@/features/consultorio/components/agenda/agenda-view'
import { SinConsultorio } from '@/features/consultorio/components/sin-consultorio'

export const metadata = {
  title: 'Agenda | MediCuenta',
}

export default async function AgendaPage() {
  const r = await resolverConsultorio()
  if (!r) redirect('/login')
  if (!r.ctx.medicoActivoId) return <SinConsultorio />
  return <AgendaView medicoId={r.ctx.medicoActivoId} />
}
