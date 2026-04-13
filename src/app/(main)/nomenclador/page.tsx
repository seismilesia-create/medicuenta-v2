import type { Metadata } from 'next'
import { NomencladorSearch, NomencladorCalculator } from '@/features/nomenclador/components'

export const metadata: Metadata = {
  title: 'Nomenclador OSEP | MediCuenta',
  description: 'Busca practicas del nomenclador OSEP y calcula el total de multiples intervenciones',
}

export default function NomencladorPage() {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--color-foreground)' }}>
          Nomenclador OSEP
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          Busca practicas y calcula el total con regla de multiples intervenciones
        </p>
      </div>

      {/* Calculator first on top */}
      <NomencladorCalculator />

      {/* Search */}
      <NomencladorSearch />
    </div>
  )
}
