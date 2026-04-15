import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filters = parseFilters(params)
  const data = await fetchReportesData(filters)

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 lg:px-12 lg:py-12 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
          Reportes
        </h1>
        <p className="mt-1.5 text-base" style={{ color: 'var(--color-foreground-secondary)' }}>
          Análisis de facturación, cobros, débitos y plus — período {data.rango.desde} a {data.rango.hasta}.
        </p>
      </div>

      <ReportesFiltersBar
        filters={filters}
        obrasSocialesDisponibles={data.obrasSocialesDisponibles}
        institucionesDisponibles={data.institucionesDisponibles}
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
  )
}
