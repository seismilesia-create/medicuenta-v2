import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Activity, FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import {
  DashboardTrendChart,
  DashboardAlerts,
  MetricCard,
  QuickActions,
  MiAsistenteWhatsapp,
} from '@/features/dashboard/components'
import type { TrendDataPoint } from '@/features/dashboard/components/DashboardTrendChart'
import type { AlertItem } from '@/features/dashboard/components/DashboardAlerts'

export const metadata = {
  title: 'Dashboard | MediCuenta',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [ordenesRes, debitosRes, liquidacionesRes, cirugiasRes, perfilRes, asignacionRes] = await Promise.all([
    supabase.from('ordenes').select('estado, honorario_calculado, monto_particular, monto_plus, fecha_atencion'),
    supabase.from('debitos').select('monto, fecha, refacturable, refacturado'),
    supabase.from('liquidaciones').select('estado'),
    supabase.from('cirugias').select('estado, total_calculado'),
    supabase.from('perfiles').select('nombre').eq('id', user.id).maybeSingle(),
    supabase.from('wa_asignaciones').select('slug_publico').eq('medico_id', user.id).eq('activo', true).maybeSingle(),
  ])

  const ordenes = ordenesRes.data ?? []
  const debitos = debitosRes.data ?? []
  const liquidaciones = liquidacionesRes.data ?? []
  const cirugias = cirugiasRes.data ?? []

  const stats = { facturado: 0, cobrado: 0, pendiente: 0, perdido: 0 }
  for (const orden of ordenes) {
    const monto = Number(orden.honorario_calculado) + Number(orden.monto_particular) + Number(orden.monto_plus)
    stats.facturado += monto
    switch (orden.estado) {
      case 'aprobada':
        stats.cobrado += monto
        break
      case 'debitada':
        stats.perdido += monto
        break
      case 'borrador':
      case 'presentada':
        stats.pendiente += monto
        break
    }
  }

  const nombre = (perfilRes.data?.nombre ?? null) as string | null
  const slug = asignacionRes.data?.slug_publico ?? null
  const linkAsistente = slug ? `${process.env.PUBLIC_BASE_URL ?? ''}/c/${slug}` : null
  const trendData = computeTrendData(ordenes, debitos)
  const alerts = computeAlerts(ordenes, debitos, liquidaciones, cirugias)
  const greeting = getGreeting()

  return (
    <div className="h-full overflow-y-auto">
      {/* Header con gradient + blur orb */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
              <Activity className="h-6 w-6 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {greeting}, {nombre ? `Dr. ${nombre}` : 'Doctor'}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Resumen de tu facturacion medica
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-8 md:pb-12 space-y-6">
        {/* Asistente WhatsApp */}
        <MiAsistenteWhatsapp link={linkAsistente} />

        {/* Metrics Grid */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Facturado este mes"
            value={stats.facturado}
            icon={FileText}
            variant="default"
            description="Total presentado a obras sociales"
          />
          <MetricCard
            title="Cobrado"
            value={stats.cobrado}
            icon={CheckCircle2}
            variant="success"
            description="Pagos recibidos confirmados"
          />
          <MetricCard
            title="Pendiente"
            value={stats.pendiente}
            icon={Clock}
            variant="warning"
            description="Esperando aprobacion"
          />
          <MetricCard
            title="Debitos"
            value={stats.perdido}
            icon={AlertTriangle}
            variant="danger"
            description="Descuentos aplicados"
          />
        </div>

        {/* Chart */}
        <DashboardTrendChart data={trendData} />

        {/* Bottom Grid - Alerts & Quick Actions */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DashboardAlerts alerts={alerts} />
          </div>
          <QuickActions ordenesCount={ordenes.length} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos dias'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function computeTrendData(
  ordenes: { estado: string; honorario_calculado: number; monto_particular: number; monto_plus: number; fecha_atencion: string }[],
  debitos: { monto: number; fecha: string }[],
): TrendDataPoint[] {
  const now = new Date()
  const months: TrendDataPoint[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })

    months.push({
      month: label.charAt(0).toUpperCase() + label.slice(1),
      facturado: 0,
      cobrado: 0,
      debitado: 0,
    })

    for (const orden of ordenes) {
      if (orden.fecha_atencion.startsWith(key)) {
        const monto = Number(orden.honorario_calculado) + Number(orden.monto_particular) + Number(orden.monto_plus)
        months[months.length - 1].facturado += monto
        if (orden.estado === 'aprobada') months[months.length - 1].cobrado += monto
      }
    }

    for (const debito of debitos) {
      if (debito.fecha.startsWith(key)) {
        months[months.length - 1].debitado += Number(debito.monto)
      }
    }
  }

  const hasData = months.some((m) => m.facturado > 0 || m.cobrado > 0 || m.debitado > 0)
  return hasData ? months : []
}

function computeAlerts(
  ordenes: { estado: string }[],
  debitos: { refacturable: boolean; refacturado: boolean }[],
  liquidaciones: { estado: string }[],
  cirugias: { estado: string }[],
): AlertItem[] {
  const alerts: AlertItem[] = []

  const borradores = ordenes.filter((o) => o.estado === 'borrador').length
  if (borradores > 0) {
    alerts.push({
      type: 'warning',
      message: `${borradores} ${borradores === 1 ? 'orden en borrador' : 'ordenes en borrador'}`,
      href: '/ordenes',
      count: borradores,
    })
  }

  const cirugiasBorrador = cirugias.filter((c) => c.estado === 'borrador').length
  if (cirugiasBorrador > 0) {
    alerts.push({
      type: 'warning',
      message: `${cirugiasBorrador} ${cirugiasBorrador === 1 ? 'cirugia en borrador' : 'cirugias en borrador'}`,
      href: '/cirugias',
      count: cirugiasBorrador,
    })
  }

  const refacturables = debitos.filter((d) => d.refacturable && !d.refacturado).length
  if (refacturables > 0) {
    alerts.push({
      type: 'error',
      message: `${refacturables} ${refacturables === 1 ? 'debito refacturable' : 'debitos refacturables'} sin refacturar`,
      href: '/debitos',
      count: refacturables,
    })
  }

  const pendientes = liquidaciones.filter((l) => l.estado === 'pendiente').length
  if (pendientes > 0) {
    alerts.push({
      type: 'info',
      message: `${pendientes} ${pendientes === 1 ? 'liquidacion pendiente' : 'liquidaciones pendientes'}`,
      href: '/liquidaciones',
      count: pendientes,
    })
  }

  return alerts
}
