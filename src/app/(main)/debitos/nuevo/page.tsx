import type { Metadata } from 'next'
import Link from 'next/link'
import { NuevoDebitoForm } from '@/features/debitos/components'

export const metadata: Metadata = {
  title: 'Nuevo Débito | MediCuenta',
}

export default function NuevoDebitoPage() {
  return (
    <div className="p-6">
      {/* Header with back link */}
      <div className="mb-6">
        <Link
          href="/debitos"
          className="inline-flex items-center gap-2 text-sm mb-4 transition-colors"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver a débitos
        </Link>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Nuevo Débito
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
          Registra un nuevo débito aplicado por la obra social
        </p>
      </div>

      {/* Form */}
      <NuevoDebitoForm />
    </div>
  )
}
