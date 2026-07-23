import type { Metadata } from 'next'
import { Grid3X3 } from 'lucide-react'
import { NomencladorSearch, NomencladorCalculator } from '@/features/nomenclador/components'

export const metadata: Metadata = {
  title: 'Nomenclador OSEP | MediCuenta',
  description: 'Busca prácticas del nomenclador OSEP y calcula el total de múltiples intervenciones',
}

export default function NomencladorPage() {
  return (
    <div className="h-full overflow-y-auto">
      {/* Header con gradient violeta */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/10 ring-1 ring-violet-500/20">
              <Grid3X3 className="h-6 w-6 text-violet-500" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Nomenclador OSEP</h1>
              <p className="text-sm text-muted-foreground">Busca prácticas y calcula el total con regla de múltiples intervenciones</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-8 md:pb-12 space-y-6">
        <NomencladorCalculator />
        <NomencladorSearch />
      </div>
    </div>
  )
}
