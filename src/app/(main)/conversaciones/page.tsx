import { redirect } from 'next/navigation'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { ConversacionesView } from '@/features/consultorio/components/conversaciones/conversaciones-view'
import { SinConsultorio } from '@/features/consultorio/components/sin-consultorio'

export const metadata = {
  title: 'Conversaciones | MediCuenta',
}

export default async function ConversacionesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const r = await resolverConsultorio()
  if (!r) redirect('/login')
  if (r.ctx.acceso.acceso === 'bloqueado') redirect('/plan') // candado F4.3 §5: suscripción
  if (r.ctx.plan !== 'full') redirect('/dashboard') // candado §3: consultorio = Full
  if (!r.ctx.medicoActivoId) return <SinConsultorio />
  const { id } = await searchParams
  return <ConversacionesView medicoId={r.ctx.medicoActivoId} initialId={id ?? null} />
}
