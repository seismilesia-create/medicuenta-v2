import { Users, Cpu, MessageSquareWarning, AlertTriangle } from 'lucide-react'
import { getMedicosConMetricas } from '@/features/admin/services/superadminService'
import { MetricCard } from '@/features/dashboard/components'
import { MedicosTabla } from '@/features/admin/components/medicos-tabla'

export const metadata = {
  title: 'Panel del dueño | MediCuenta',
}

const intAR = new Intl.NumberFormat('es-AR')

export default async function AdminPage() {
  const { resumen, medicos } = await getMedicosConMetricas()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Resumen del negocio</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Costo y actividad de los últimos 30 días (errores: 7 días). Datos en vivo a medida que los médicos usan los asistentes.
        </p>
      </div>

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
