import { redirect } from 'next/navigation'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { PlanView } from '@/features/suscripcion/components/plan-view'
import type { Plan } from '@/lib/admin/planes'

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
  const { supabase, ctx } = r

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // El precio lo resuelve el servidor. NULL = todavía sin publicar → no se contrata.
  const { data: filas } = await supabase
    .from('precios_planes')
    .select('plan, monto_ars')
    .returns<{ plan: Plan; monto_ars: number | string | null }[]>()

  const precioDe = (p: Plan): number | null => {
    const crudo = filas?.find((f) => f.plan === p)?.monto_ars
    if (crudo == null) return null
    const n = Number(crudo)
    return Number.isFinite(n) ? n : null
  }

  // RLS delegada: la secretaria también lee la fila de su médico (ve el estado, pero
  // no puede contratar — el formulario es solo del dueño).
  const { data: sub } = await supabase
    .from('suscripciones')
    .select('mp_subscription_id, mp_payer_email, current_period_end')
    .eq('medico_id', ctx.medicoActivoId ?? '')
    .maybeSingle<{
      mp_subscription_id: string | null
      mp_payer_email: string | null
      current_period_end: string | null
    }>()

  return (
    <PlanView
      acceso={ctx.acceso}
      plan={ctx.plan}
      esDueño={esDueño(ctx)}
      precios={{ basico: precioDe('basico'), full: precioDe('full') }}
      tieneSuscripcionMP={Boolean(sub?.mp_subscription_id)}
      proximoCobro={sub?.current_period_end ?? null}
      // Precargamos el email de MediCuenta, pero editable: el de su cuenta de MP suele
      // ser otro, y si no coincide MP le rechaza el pago (D11).
      emailSugerido={sub?.mp_payer_email ?? user?.email ?? ''}
    />
  )
}
