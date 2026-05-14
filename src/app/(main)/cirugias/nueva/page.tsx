import Link from 'next/link'
import { NuevaCirugiaForm } from '@/features/cirugias/components'

export const metadata = { title: 'Nueva Cirugia | MediCuenta' }

export default function NuevaCirugiaPage() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/cirugias"
          className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          &larr; Volver a Cirugias
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1
          className="text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: 'var(--color-foreground)' }}
        >
          Nueva cirugia
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Registra una nueva cirugia o procedimiento quirurgico
        </p>
      </div>

      {/* Form */}
      <NuevaCirugiaForm />
    </div>
  )
}
