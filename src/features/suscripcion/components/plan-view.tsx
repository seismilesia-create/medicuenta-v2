'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Clock, CheckCircle2, Check } from 'lucide-react'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import { contratarPlan, darDeBaja } from '@/actions/suscripcion'
import type { Acceso, Plan } from '@/lib/admin/planes'

const PESOS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const PLANES: { id: Plan; nombre: string; incluye: string[] }[] = [
  {
    id: 'basico',
    nombre: 'Básico',
    incluye: ['Facturación a obras sociales', 'Asistente IA de facturación', 'Reportes y liquidaciones'],
  },
  {
    id: 'full',
    nombre: 'Full',
    incluye: [
      'Todo lo del plan Básico',
      'Asistente de WhatsApp',
      'Agenda y turnos automáticos',
      'Pacientes y recetas',
      'Secretaria',
    ],
  },
]

/** El cartel de arriba: en qué punto del ciclo está (spec F4.3 §8). */
function estadoDe(acceso: Acceso) {
  if (acceso.acceso === 'bloqueado') {
    if (acceso.motivo === 'prueba_vencida') {
      return {
        Icono: Clock,
        color: 'text-amber-500',
        titulo: 'Se terminó tu prueba gratis',
        detalle: 'Contratá un plan para volver a entrar. Tus datos están intactos, no se borró nada.',
      }
    }
    if (acceso.motivo === 'suspendida') {
      return {
        Icono: AlertTriangle,
        color: 'text-red-500',
        titulo: 'Tu suscripción está suspendida',
        detalle: 'No pudimos cobrarte y se agotaron los reintentos. Contratá de nuevo para reactivarla.',
      }
    }
    return {
      Icono: AlertTriangle,
      color: 'text-red-500',
      titulo: 'Diste de baja tu suscripción',
      detalle: 'Podés volver a contratar cuando quieras. Tus datos siguen guardados.',
    }
  }
  if (acceso.acceso === 'aviso') {
    if (acceso.motivo === 'morosa') {
      return {
        Icono: AlertTriangle,
        color: 'text-red-500',
        titulo: 'No pudimos cobrar tu suscripción',
        detalle:
          'Estamos reintentando el cobro. Actualizá tu medio de pago o contratá de nuevo para no perder el acceso.',
      }
    }
    const d = acceso.diasRestantes
    return {
      Icono: Clock,
      color: acceso.motivo === 'trial_urgente' ? 'text-amber-500' : 'text-muted-foreground',
      titulo: `Te ${d === 1 ? 'queda' : 'quedan'} ${d} ${d === 1 ? 'día' : 'días'} de prueba`,
      detalle: 'Estás probando el plan Full con todo desbloqueado. Elegí tu plan para seguir.',
    }
  }
  return {
    Icono: CheckCircle2,
    color: 'text-emerald-500',
    titulo: 'Tu plan está al día',
    detalle: 'No tenés nada pendiente.',
  }
}

export function PlanView({
  acceso,
  plan,
  esDueño,
  precios,
  tieneSuscripcionMP,
  proximoCobro,
  emailSugerido,
}: {
  acceso: Acceso
  plan: Plan
  esDueño: boolean
  precios: Record<Plan, number | null>
  tieneSuscripcionMP: boolean
  proximoCobro: string | null
  emailSugerido: string
}) {
  const { Icono, color, titulo, detalle } = estadoDe(acceso)
  const [elegido, setElegido] = useState<Plan | null>(null)
  const [email, setEmail] = useState(emailSugerido)
  const [error, setError] = useState<string | null>(null)
  const [confirmarBaja, setConfirmarBaja] = useState(false)
  const [pendiente, startTransition] = useTransition()

  function contratar(p: Plan) {
    setError(null)
    startTransition(async () => {
      const r = await contratarPlan({ plan: p, payerEmail: email })
      if ('error' in r) {
        setError(r.error)
        return
      }
      // A MercadoPago a poner la tarjeta. Nunca la vemos nosotros.
      window.location.href = r.initPoint
    })
  }

  function baja() {
    setConfirmarBaja(false)
    setError(null)
    startTransition(async () => {
      const r = await darDeBaja()
      if ('error' in r) setError(r.error)
      else window.location.reload()
    })
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      {/* Estado actual */}
      <div className="rounded-2xl border border-border p-6 text-center">
        <Icono className={`mx-auto h-8 w-8 ${color}`} strokeWidth={1.5} />
        <h1 className="mt-3 text-lg font-semibold">{titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{detalle}</p>
        {proximoCobro && acceso.acceso !== 'bloqueado' && (
          <p className="mt-2 text-xs text-muted-foreground">
            Próximo cobro: {new Date(proximoCobro).toLocaleDateString('es-AR')}
          </p>
        )}
      </div>

      {!esDueño ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          El plan lo maneja el médico del consultorio.
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PLANES.map((p) => {
              const precio = precios[p.id]
              const actual = plan === p.id && acceso.acceso !== 'bloqueado'
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-6 ${
                    elegido === p.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-semibold">{p.nombre}</h2>
                    {actual && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        Tu plan
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-2xl font-bold tracking-tight">
                    {precio == null ? (
                      <span className="text-base font-medium text-muted-foreground">A confirmar</span>
                    ) : (
                      <>
                        {PESOS.format(precio)}
                        <span className="text-sm font-normal text-muted-foreground"> /mes</span>
                      </>
                    )}
                  </p>

                  <ul className="mt-4 space-y-1.5">
                    {p.incluye.map((i) => (
                      <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" strokeWidth={3} />
                        {i}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => setElegido(p.id)}
                    disabled={precio == null || pendiente}
                    className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {precio == null ? 'Todavía no disponible' : `Contratar ${p.nombre}`}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Sin precio no hay contratación: mejor decirlo que dejar dos botones muertos. */}
          {precios.basico == null && precios.full == null && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Todavía no publicamos los precios. Escribinos y activamos tu plan a mano.
            </p>
          )}

          {/* El email de MP: recién cuando eligió, para no pedir datos porque sí. */}
          {elegido && (
            <div className="mt-6 rounded-2xl border border-border p-6">
              <label htmlFor="mp-email" className="text-sm font-medium">
                ¿Con qué cuenta de Mercado Pago vas a pagar?
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Tiene que ser el email de tu cuenta de Mercado Pago. Si no coincide, Mercado Pago
                rechaza el pago.
              </p>
              <input
                id="mp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucuenta@email.com"
                className="mt-3 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
              />
              <button
                onClick={() => contratar(elegido)}
                disabled={pendiente || !email.trim()}
                className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {pendiente ? 'Preparando el pago…' : 'Ir a pagar'}
              </button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Te lleva a Mercado Pago. La tarjeta la cargás allá: nosotros no la vemos nunca.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {tieneSuscripcionMP && acceso.acceso !== 'bloqueado' && (
            <button
              onClick={() => setConfirmarBaja(true)}
              disabled={pendiente}
              className="mx-auto mt-8 block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Dar de baja mi suscripción
            </button>
          )}
        </>
      )}

      {confirmarBaja && (
        <ConfirmDialog
          titulo="¿Dar de baja tu suscripción?"
          // En MP cancelar es IRREVERSIBLE: se lo decimos antes, no después.
          mensaje="Se cancela el débito automático y vas a perder el acceso. Tus datos quedan guardados, pero para volver vas a tener que contratar de nuevo."
          confirmLabel="Dar de baja"
          cancelLabel="No, volver"
          peligroso
          onConfirm={baja}
          onCancel={() => setConfirmarBaja(false)}
        />
      )}
    </div>
  )
}
