import { redirect } from 'next/navigation'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { PlanView } from '@/features/suscripcion/components/plan-view'

export const metadata = {
  title: 'Mi plan | MediCuenta',
}

/**
 * La salida del bloqueo (spec F4.3 §5). Es la ÚNICA ruta de la app que el candado de
 * suscripción no mira — por eso `/plan` está fuera de `RUTAS_APP` en el middleware, y
 * por eso esta página no puede redirigir por `acceso`: sería un loop.
 */
export default async function PlanPage() {
  const r = await resolverConsultorio()
  if (!r) redirect('/login')
  return <PlanView acceso={r.ctx.acceso} plan={r.ctx.plan} />
}
