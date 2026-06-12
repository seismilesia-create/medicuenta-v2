'use server'

import { cookies } from 'next/headers'
import { resolverConsultorio, COOKIE_CONSULTORIO } from '@/features/consultorio/access/contexto'

/** Cambia el consultorio activo (multi-consultorio). La cookie solo puede apuntar a un médico
 *  de la lista permitida; el resolver igual la revalida en cada request. */
export async function seleccionarConsultorio(medicoId: string) {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' }
  if (!r.ctx.medicos.some((m) => m.id === medicoId)) return { error: 'Consultorio no permitido' }
  ;(await cookies()).set(COOKIE_CONSULTORIO, medicoId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true as const }
}
