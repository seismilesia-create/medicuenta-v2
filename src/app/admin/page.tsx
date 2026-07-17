import Link from 'next/link'
import { Users, Cpu, MessageSquareWarning, AlertTriangle, Bot } from 'lucide-react'
import { getMedicosConMetricas } from '@/features/admin/services/superadminService'
import { detectarAlertas } from '@/lib/admin/alertas'
import { resumenNegocio } from '@/lib/admin/negocio'
import { MetricCard } from '@/features/dashboard/components'
import { MedicosTabla } from '@/features/admin/components/medicos-tabla'
import { AlertasPanel } from '@/features/admin/components/alertas-panel'
import { EnviarDigestBoton } from '@/features/admin/components/enviar-digest-boton'
import { PreciosPanel } from '@/features/admin/components/precios-panel'
import { createServiceClient } from '@/lib/supabase/server'
import type { Plan } from '@/lib/admin/planes'

export const metadata = {
  title: 'Panel del dueño | MediCuenta',
}

const intAR = new Intl.NumberFormat('es-AR')

const CHIPS: { key: keyof ReturnType<typeof resumenNegocio>; label: string; color?: string }[] = [
  { key: 'full', label: 'Full' },
  { key: 'basico', label: 'Básico' },
  { key: 'enPrueba', label: 'En prueba', color: '#3b82f6' },
  { key: 'activos', label: 'Activos', color: '#16a34a' },
  { key: 'morosos', label: 'Morosos', color: '#ef4444' },
  { key: 'suspendidos', label: 'Suspendidos', color: '#f59e0b' },
]

/** Los precios de los planes (F4.3 R6). Por service-role: la página ya está detrás de
 *  `resolverSuperadmin` en el layout de /admin. */
async function getPrecios(): Promise<Record<Plan, number | null>> {
  const { data } = await createServiceClient()
    .from('precios_planes')
    .select('plan, monto_ars')
    .returns<{ plan: Plan; monto_ars: number | string | null }[]>()

  const leer = (p: Plan) => {
    const crudo = data?.find((f) => f.plan === p)?.monto_ars
    if (crudo == null) return null
    const n = Number(crudo)
    return Number.isFinite(n) ? n : null
  }
  return { basico: leer('basico'), full: leer('full') }
}

export default async function AdminPage() {
  const { resumen, medicos } = await getMedicosConMetricas()
  const alertas = detectarAlertas(medicos, Date.now())
  const negocio = resumenNegocio(medicos)
  const precios = await getPrecios()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Resumen del negocio</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Costo y actividad de los últimos 30 días (errores: 7 días). Datos en vivo a medida que los médicos usan los asistentes.
        </p>
      </div>

      {/* Cartera: distribución por plan y estado */}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm"
          >
            <span className="font-semibold tabular-nums" style={c.color ? { color: c.color } : undefined}>
              {negocio[c.key]}
            </span>
            <span className="text-[var(--color-muted-foreground)]">{c.label}</span>
          </span>
        ))}
      </div>

      <PreciosPanel precios={precios} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Médicos" value={resumen.totalMedicos} icon={Users} variant="default" valueFormat="integer" description="en la plataforma" />
        <MetricCard
          title="Tokens de IA (30 d)"
          value={resumen.totalTokens30d}
          icon={Cpu}
          variant="info"
          valueFormat="integer"
          description={`Promedio ${intAR.format(Math.round(resumen.promedioTokens))} por médico`}
        />
        <MetricCard
          title="Mensajes con costo (30 d)"
          value={resumen.totalMensajesPagos30d}
          icon={MessageSquareWarning}
          variant="warning"
          valueFormat="integer"
          description="WhatsApp fuera de la ventana 24 h"
        />
        <MetricCard
          title="Errores (7 d)"
          value={resumen.totalErrores7d}
          icon={AlertTriangle}
          variant={resumen.totalErrores7d > 0 ? 'danger' : 'success'}
          valueFormat="integer"
          description={resumen.totalErrores7d > 0 ? 'revisar en la bitácora' : 'todo en orden'}
        />
      </div>

      {/* Gestión */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/medicos" className="block rounded-xl border border-border p-4 hover:bg-muted transition-colors">
          <div className="font-medium">Médicos</div>
          <div className="text-sm text-[var(--color-muted-foreground)]">Onboardear y ver el estado de cableado</div>
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Orquestador</h2>
            <span className="text-xs text-[var(--color-muted-foreground)]">— lo que detectó al vigilar</span>
          </div>
          <EnviarDigestBoton />
        </div>
        <AlertasPanel alertas={alertas} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Médicos</h2>
          {resumen.cantOutliers > 0 && (
            <span className="text-xs text-amber-600">
              {resumen.cantOutliers} médico(s) consumiendo bastante más que el promedio
            </span>
          )}
        </div>
        <MedicosTabla medicos={medicos} />
      </div>
    </div>
  )
}
