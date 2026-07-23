import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { hoyArgentina } from '@/shared/lib/fechas'
import { siteUrl } from '@/lib/site-url'
import { Activity, FileText, CheckCircle2, Clock, AlertTriangle, Wallet } from 'lucide-react'
import {
  DashboardTrendChart,
  DashboardAlerts,
  MetricCard,
  QuickActions,
  MiAsistenteWhatsapp,
} from '@/features/dashboard/components'
import type { TrendDataPoint } from '@/features/dashboard/components/DashboardTrendChart'
import type { AlertItem } from '@/features/dashboard/components/DashboardAlerts'
import { MEDIOS_COBRO, MEDIO_LABELS, type MedioCobro } from '@/features/cobros/types/cobros'

export const metadata = {
  title: 'Inicio | MediCuenta',
}

const $ = (n: number) => `$${(Number(n) || 0).toLocaleString('es-AR')}`

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Las tarjetas dicen "este mes": mes en curso en hora ARGENTINA.
  const mesActual = hoyArgentina().slice(0, 7) // YYYY-MM
  const inicioMesIso = new Date(`${mesActual}-01T00:00:00-03:00`).toISOString()

  const [ordenesRes, debitosRes, liquidacionesRes, cirugiasRes, perfilRes, asignacionRes, cobrosMesRes, ultimoCierreRes] =
    await Promise.all([
      supabase.from('ordenes').select('estado, honorario_calculado, monto_particular, fecha_atencion'),
      supabase.from('debitos').select('monto, fecha, refacturable, refacturado'),
      supabase.from('liquidaciones').select('estado'),
      supabase.from('cirugias').select('estado, total_calculado'),
      supabase.from('perfiles').select('nombre, apellido, especialidad').eq('id', user.id).maybeSingle(),
      supabase.from('wa_asignaciones').select('slug_publico').eq('medico_id', user.id).eq('activo', true).maybeSingle(),
      supabase.from('cobros').select('concepto, medio, monto').eq('estado', 'cobrado').gte('cobrado_at', inicioMesIso),
      supabase
        .from('cierres_dia')
        .select('fecha, total_honorarios, total_plus, total_mp, cerrado_por')
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const ordenes = ordenesRes.data ?? []
  const debitos = debitosRes.data ?? []
  const liquidaciones = liquidacionesRes.data ?? []
  const cirugias = cirugiasRes.data ?? []

  // El plus es privado (efectivo en mano, no va a la OS) → se excluye de la cobranza,
  // igual que en Reportes (ordenFacturado = honorario + particular).
  const stats = { facturado: 0, cobrado: 0, pendiente: 0, perdido: 0 }
  for (const orden of ordenes) {
    if (!String(orden.fecha_atencion ?? '').startsWith(mesActual)) continue
    const monto = Number(orden.honorario_calculado) + Number(orden.monto_particular)
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
  const apellido = (perfilRes.data?.apellido ?? null) as string | null
  const especialidad = (perfilRes.data?.especialidad ?? null) as string | null
  const slug = asignacionRes.data?.slug_publico ?? null
  const linkAsistente = slug ? `${siteUrl()}/c/${slug}` : null
  const trendData = computeTrendData(ordenes, debitos)
  const alerts = computeAlerts(ordenes, debitos, liquidaciones, cirugias)
  const greeting = getGreeting()

  // Caja del mes: la plata REAL que entró (ledger de cobros: plus + particulares), por medio.
  const cajaMes = Object.fromEntries(MEDIOS_COBRO.map((m) => [m, 0])) as Record<MedioCobro, number>
  let plusMes = 0
  let particularMes = 0
  for (const c of (cobrosMesRes.data ?? []) as { concepto: string; medio: MedioCobro; monto: number }[]) {
    const monto = Number(c.monto) || 0
    cajaMes[c.medio] = (cajaMes[c.medio] ?? 0) + monto
    if (c.concepto === 'consulta_particular') particularMes += monto
    else plusMes += monto
  }
  const cajaMesTotal = Object.values(cajaMes).reduce((a, b) => a + b, 0)
  const ultimoCierre = ultimoCierreRes.data as
    | { fecha: string; total_honorarios: number; total_plus: number; total_mp: number; cerrado_por: string | null }
    | null

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
        <MiAsistenteWhatsapp link={linkAsistente} nombre={nombre} apellido={apellido} especialidad={especialidad} />

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

        {/* Caja del mes (ledger de cobros) + acceso al Cierre del día */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-border p-5 space-y-3">
            <h3 className="font-semibold text-foreground">Caja del mes — {$(cajaMesTotal)}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {MEDIOS_COBRO.map((m) => (
                <div key={m} className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">{MEDIO_LABELS[m]}</p>
                  <p className="font-mono font-semibold text-foreground">{$(cajaMes[m])}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Plus: <strong className="text-foreground">{$(plusMes)}</strong> · Consultas particulares:{' '}
              <strong className="text-foreground">{$(particularMes)}</strong> — privado, no va a la obra social.
            </p>
          </div>
          <Link
            href="/cierre"
            className="rounded-2xl border border-border p-5 space-y-2 hover:border-primary/50 transition-colors block"
          >
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" /> Cierre del día
            </h3>
            {ultimoCierre ? (
              <p className="text-sm text-muted-foreground">
                Último cierre: <strong className="text-foreground">{ultimoCierre.fecha}</strong>
                {ultimoCierre.cerrado_por ? '' : ' (automático)'} · honorarios {$(Number(ultimoCierre.total_honorarios))} ·
                plus {$(Number(ultimoCierre.total_plus))} · MP {$(Number(ultimoCierre.total_mp))}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Todavía sin cierres. La rendición diaria: órdenes por obra social, caja por medio de pago y turnos vs.
                plata.
              </p>
            )}
            <p className="text-sm font-medium text-primary">Ver la rendición →</p>
          </Link>
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
  ordenes: { estado: string; honorario_calculado: number; monto_particular: number; fecha_atencion: string }[],
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
        // El plus es privado (efectivo en mano): fuera de facturado/cobrado, igual que las KPI.
        const monto = Number(orden.honorario_calculado) + Number(orden.monto_particular)
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
