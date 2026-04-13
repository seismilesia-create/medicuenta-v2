import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { DashboardTrendChart } from '@/features/dashboard/components/DashboardTrendChart'
import { DashboardAlerts } from '@/features/dashboard/components/DashboardAlerts'
import type { TrendDataPoint } from '@/features/dashboard/components/DashboardTrendChart'
import type { AlertItem } from '@/features/dashboard/components/DashboardAlerts'

export const metadata = {
  title: 'Dashboard | MediCuenta'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch data from all tables in parallel
  const [ordenesRes, debitosRes, liquidacionesRes, cirugiasRes] = await Promise.all([
    supabase.from('ordenes').select('estado, honorario_calculado, monto_particular, monto_plus, fecha_atencion'),
    supabase.from('debitos').select('monto, fecha, refacturable, refacturado'),
    supabase.from('liquidaciones').select('estado'),
    supabase.from('cirugias').select('estado, total_calculado'),
  ])

  const ordenes = ordenesRes.data ?? []
  const debitos = debitosRes.data ?? []
  const liquidaciones = liquidacionesRes.data ?? []
  const cirugias = cirugiasRes.data ?? []

  // Compute stats
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

  // Compute trend data and alerts
  const trendData = computeTrendData(ordenes, debitos)
  const alerts = computeAlerts(ordenes, debitos, liquidaciones, cirugias)
  const greeting = getGreeting()

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 lg:px-12 lg:py-12 max-w-7xl mx-auto space-y-6 md:space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
          {greeting}, Doctor
        </h1>
        <p className="mt-1.5 text-base" style={{ color: 'var(--color-foreground-secondary)' }}>
          Resumen de tu facturacion medica
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Facturado este mes"
          value={formatMonto(stats.facturado)}
          color="var(--color-info)"
          bgColor="var(--color-info-light)"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          label="Cobrado"
          value={formatMonto(stats.cobrado)}
          color="var(--color-success)"
          bgColor="var(--color-success-light)"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          label="Pendiente"
          value={formatMonto(stats.pendiente)}
          color="var(--color-warning)"
          bgColor="var(--color-warning-light)"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Perdido (debitos)"
          value={formatMonto(stats.perdido)}
          color="var(--color-error)"
          bgColor="var(--color-error-light)"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Trend Chart */}
      <DashboardTrendChart data={trendData} />

      {/* Alerts + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl p-5 md:p-7" style={{ backgroundColor: 'var(--color-surface)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
            Alertas activas
          </h2>
          <DashboardAlerts alerts={alerts} />
        </div>

        <div className="rounded-xl p-5 md:p-7" style={{ backgroundColor: 'var(--color-surface)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
            Acciones rapidas
          </h2>
          <div className="space-y-3">
            <Link
              href="/ordenes/nueva"
              className="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              style={{ backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-foreground)' }}
            >
              + Nueva orden
            </Link>
            <Link
              href="/liquidaciones/nueva"
              className="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              style={{ backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-foreground)' }}
            >
              + Nueva liquidacion
            </Link>
            <Link
              href="/debitos/nuevo"
              className="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              style={{ backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-foreground)' }}
            >
              + Nuevo debito
            </Link>
            <Link
              href="/cirugias/nueva"
              className="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              style={{ backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-foreground)' }}
            >
              + Nueva cirugia
            </Link>
            <Link
              href="/ordenes"
              className="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              style={{ backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-foreground)' }}
            >
              Ver ordenes ({ordenes.length})
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value, color, bgColor, icon }: {
  label: string
  value: string
  color: string
  bgColor: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl p-5 md:p-7 transition-colors duration-200" style={{ backgroundColor: 'var(--color-surface)' }}>
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ backgroundColor: bgColor, color }}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground-secondary)' }}>{label}</p>
          <p className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color }}>{value}</p>
        </div>
      </div>
    </div>
  )
}

function formatMonto(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

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

  const hasData = months.some(m => m.facturado > 0 || m.cobrado > 0 || m.debitado > 0)
  return hasData ? months : []
}

function computeAlerts(
  ordenes: { estado: string }[],
  debitos: { refacturable: boolean; refacturado: boolean }[],
  liquidaciones: { estado: string }[],
  cirugias: { estado: string }[],
): AlertItem[] {
  const alerts: AlertItem[] = []

  const borradores = ordenes.filter(o => o.estado === 'borrador').length
  if (borradores > 0) {
    alerts.push({
      type: 'warning',
      message: `${borradores} ${borradores === 1 ? 'orden en borrador' : 'ordenes en borrador'}`,
      href: '/ordenes',
      count: borradores,
    })
  }

  const cirugiasBorrador = cirugias.filter(c => c.estado === 'borrador').length
  if (cirugiasBorrador > 0) {
    alerts.push({
      type: 'warning',
      message: `${cirugiasBorrador} ${cirugiasBorrador === 1 ? 'cirugia en borrador' : 'cirugias en borrador'}`,
      href: '/cirugias',
      count: cirugiasBorrador,
    })
  }

  const refacturables = debitos.filter(d => d.refacturable && !d.refacturado).length
  if (refacturables > 0) {
    alerts.push({
      type: 'error',
      message: `${refacturables} ${refacturables === 1 ? 'debito refacturable' : 'debitos refacturables'} sin refacturar`,
      href: '/debitos',
      count: refacturables,
    })
  }

  const pendientes = liquidaciones.filter(l => l.estado === 'pendiente').length
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
