import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Plus } from 'lucide-react'
import { DebitosStats, DebitosTable } from '@/features/debitos/components'
import { DebitosPieChart } from '@/features/debitos/components/DebitosPieChart'

export const metadata: Metadata = {
  title: 'Debitos | MediCuenta',
}

export default function DebitosPage() {
  return (
    <div className="h-full overflow-y-auto">
      {/* Header con gradient rojo */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-red-500/10 ring-1 ring-red-500/20">
                <AlertTriangle className="h-6 w-6 text-red-500" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Debitos</h1>
                <p className="text-sm text-muted-foreground">Seguimiento de descuentos aplicados</p>
              </div>
            </div>

            <Link
              href="/debitos/nuevo"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nuevo Debito
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-8 md:pb-12 space-y-6">
        <DebitosStats />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <DebitosTable />
          </div>
          <DebitosPieChart />
        </div>
      </div>
    </div>
  )
}
