import { AlertTriangle, Clock, CheckCircle2, CreditCard } from 'lucide-react'
import type { Acceso, Plan } from '@/lib/admin/planes'

const NOMBRE_PLAN: Record<Plan, string> = { basico: 'Básico', full: 'Full' }

interface Mensaje {
  icono: typeof Clock
  color: string
  titulo: string
  detalle: string
}

/** El texto según en qué punto del ciclo está el médico (spec F4.3 §8). */
function mensajeDe(acceso: Acceso): Mensaje {
  if (acceso.acceso === 'bloqueado') {
    switch (acceso.motivo) {
      case 'prueba_vencida':
        return {
          icono: Clock,
          color: 'text-amber-500',
          titulo: 'Se terminó tu prueba gratis',
          detalle: 'Contratá un plan para volver a entrar. Tus datos están intactos, no se borró nada.',
        }
      case 'suspendida':
        return {
          icono: AlertTriangle,
          color: 'text-red-500',
          titulo: 'Tu suscripción está suspendida',
          detalle: 'No pudimos cobrarte y se agotaron los reintentos. Actualizá tu medio de pago para reactivarla.',
        }
      case 'baja':
        return {
          icono: AlertTriangle,
          color: 'text-red-500',
          titulo: 'Diste de baja tu suscripción',
          detalle: 'Podés volver a contratar cuando quieras. Tus datos siguen guardados.',
        }
    }
  }
  if (acceso.acceso === 'aviso') {
    if (acceso.motivo === 'morosa') {
      return {
        icono: AlertTriangle,
        color: 'text-red-500',
        titulo: 'No pudimos cobrar tu suscripción',
        detalle:
          'Estamos reintentando el cobro. Actualizá tu medio de pago para no perder el acceso.',
      }
    }
    const d = acceso.diasRestantes
    return {
      icono: Clock,
      color: acceso.motivo === 'trial_urgente' ? 'text-amber-500' : 'text-[var(--color-muted-foreground)]',
      titulo: `Te ${d === 1 ? 'queda' : 'quedan'} ${d} ${d === 1 ? 'día' : 'días'} de prueba`,
      detalle:
        acceso.motivo === 'trial_urgente'
          ? 'Contratá ahora para no perder el acceso a tu consultorio.'
          : 'Estás probando el plan Full con todo desbloqueado.',
    }
  }
  return {
    icono: CheckCircle2,
    color: 'text-emerald-500',
    titulo: 'Tu plan está al día',
    detalle: 'No tenés nada pendiente.',
  }
}

export function PlanView({ acceso, plan }: { acceso: Acceso; plan: Plan }) {
  const { icono: Icono, color, titulo, detalle } = mensajeDe(acceso)

  return (
    <div className="p-6 md:p-10 max-w-lg mx-auto">
      <div className="rounded-2xl border border-border p-6 text-center space-y-3">
        <Icono className={`w-8 h-8 mx-auto ${color}`} strokeWidth={1.5} />
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{detalle}</p>

        <div className="pt-2 text-sm text-[var(--color-muted-foreground)]">
          Plan actual: <span className="font-medium text-foreground">{NOMBRE_PLAN[plan]}</span>
        </div>

        {/* Contratar entra en la fase 4 (MercadoPago). Mejor decirlo que simular un botón muerto. */}
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-[var(--color-muted-foreground)]">
          <CreditCard className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span>
            El pago online todavía no está habilitado. Escribinos y activamos tu plan a mano.
          </span>
        </div>
      </div>
    </div>
  )
}
