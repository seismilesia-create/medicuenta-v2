import type { Metadata } from 'next'
import Link from 'next/link'
import { NuevaLiquidacionForm } from '@/features/liquidaciones/components'

export const metadata: Metadata = {
  title: 'Nueva Liquidacion | MediCuenta',
}

export default function NuevaLiquidacionPage() {
  return (
    <div className="p-6">
      {/* Back link */}
      <Link
        href="/liquidaciones"
        className="inline-flex items-center gap-2 text-sm mb-6 transition-colors"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Volver a liquidaciones
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Nueva Liquidacion
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
          Registra una nueva liquidacion de obra social
        </p>
      </div>

      {/* Form */}
      <NuevaLiquidacionForm />
    </div>
  )
}
