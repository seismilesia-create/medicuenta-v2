import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { fetchReportesData } from '@/actions/reportes'
import { parseFilters } from '@/features/reportes/lib/filters'
import {
  ReportesFiltersBar,
  ReporteKPICards,
  TendenciaChart,
  FacturacionPorOSChart,
  DebitosPorMotivoChart,
  DescuentosApiladosChart,
  PlusMensualChart,
  InstitucionPendienteChart,
  TablaComparativa12Meses,
} from '@/features/reportes/components'

export const metadata = {
  title: 'Reportes | MediCuenta',
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filters = parseFilters(params)
  const data = await fetchReportesData(filters)

  return (
    <div className="h-full overflow-y-auto">
      {/* Header con gradient azul (V0 reportes usa blue) */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 ring-1 ring-blue-500/20">
              <BarChart3 className="h-6 w-6 text-blue-500" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Reportes</h1>
              <p className="text-sm text-muted-foreground">Análisis de facturación, cobros, débitos y plus</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-8 md:pb-12 space-y-6">
        <ReportesFiltersBar
          filters={filters}
          obrasSocialesDisponibles={data.obrasSocialesDisponibles}
          institucionesDisponibles={data.institucionesDisponibles}
          rango={data.rango}
        />

        <ReporteKPICards kpis={data.kpis} />

        <TendenciaChart data={data.tendencia} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FacturacionPorOSChart data={data.facturacionPorOS} />
          <DebitosPorMotivoChart data={data.debitosPorMotivo} />
        </div>

        <DescuentosApiladosChart data={data.descuentosApilados} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PlusMensualChart data={data.plusMensual} />
          <InstitucionPendienteChart data={data.institucionPendiente} />
        </div>

        <TablaComparativa12Meses rows={data.tabla12Meses} />
      </div>
    </div>
  )
}
