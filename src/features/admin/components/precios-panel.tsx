'use client'

import { useState, useTransition } from 'react'
import { Tag, AlertTriangle } from 'lucide-react'
import { setPrecioPlan } from '@/actions/superadmin'
import { MONTO_MINIMO_ARS } from '@/lib/mercadopago/preapproval'
import type { Plan } from '@/lib/admin/planes'

/** Lo que MP se lleva de cada cobro en AR (6,29% + IVA, acreditación al instante). */
const COMISION_MP = 0.0629
const IVA = 0.21

const PESOS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/**
 * Precios de los planes, editables por el dueño sin deploy (spec F4.3 R6): en Argentina
 * el precio se lo come la inflación y no puede depender de recompilar.
 *
 * Muestra lo que queda NETO después de MercadoPago, porque el error fácil es fijar el
 * precio mirando el número de arriba y descubrir la comisión cuando ya cobraste.
 */
export function PreciosPanel({ precios }: { precios: Record<Plan, number | null> }) {
  return (
    <div className="rounded-2xl border border-border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-[var(--color-muted-foreground)]" />
        <h2 className="text-sm font-semibold">Precios de los planes</h2>
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Se aplica a quien contrate <strong>desde ahora</strong>. Las suscripciones que ya están
        andando siguen con su precio viejo: cambiarlas requiere avisarle a MercadoPago una por
        una, y no está confirmado si le pide al médico volver a autorizar.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <FilaPrecio plan="basico" nombre="Básico" actual={precios.basico} />
        <FilaPrecio plan="full" nombre="Full" actual={precios.full} />
      </div>
    </div>
  )
}

function FilaPrecio({ plan, nombre, actual }: { plan: Plan; nombre: string; actual: number | null }) {
  const [valor, setValor] = useState(actual == null ? '' : String(actual))
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, start] = useTransition()

  const monto = Number(valor)
  const valido = Number.isFinite(monto) && monto >= MONTO_MINIMO_ARS
  const neto = valido ? monto * (1 - COMISION_MP * (1 + IVA)) : null

  function guardar() {
    setMsg(null)
    start(async () => {
      const r = await setPrecioPlan({ plan, montoArs: monto })
      setMsg('error' in r ? { ok: false, texto: r.error } : { ok: true, texto: 'Guardado' })
    })
  }

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{nombre}</span>
        {actual == null && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> sin publicar
          </span>
        )}
      </div>

      {/* Sin precio NO se puede contratar. Es a propósito: un placeholder olvidado seria
          un medico pagando ese monto de verdad. */}
      {actual == null && (
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          Mientras no tenga precio, nadie puede contratar este plan.
        </p>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted-foreground)]">$</span>
          <input
            type="number"
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-border bg-transparent py-1.5 pl-5 pr-2 text-sm"
          />
        </div>
        <button
          onClick={guardar}
          disabled={pending || !valido || monto === actual}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending ? '…' : 'Guardar'}
        </button>
      </div>

      {valor && !valido && (
        <p className="text-[11px] text-red-500">
          El mínimo que cobra MercadoPago es ${MONTO_MINIMO_ARS}. Menos que eso, no cobra.
        </p>
      )}
      {neto != null && (
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          Te quedan <strong className="text-foreground">{PESOS.format(neto)}</strong> por médico/mes.
          MercadoPago se lleva {PESOS.format(monto - neto)} (6,29% + IVA).
        </p>
      )}
      {msg && (
        <p className={`text-[11px] ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{msg.texto}</p>
      )}
    </div>
  )
}
