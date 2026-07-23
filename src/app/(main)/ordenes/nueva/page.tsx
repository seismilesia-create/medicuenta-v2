import Link from 'next/link'
import { NuevaOrdenSwitcher } from '@/features/ordenes/components'

export const metadata = {
  title: 'Nueva Orden | MediCuenta',
}

export default function NuevaOrdenPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/ordenes"
          className="inline-flex items-center gap-1 text-sm mb-3 transition-colors hover:opacity-80"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver a ordenes
        </Link>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Nueva Orden
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
          Registra una nueva atención médica
        </p>
      </div>

      <NuevaOrdenSwitcher />
    </div>
  )
}
