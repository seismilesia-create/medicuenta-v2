import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck, Stethoscope } from 'lucide-react'
import { resolverSuperadmin } from '@/features/admin/access/superadmin'

export const metadata = {
  title: 'Panel del dueño | MediCuenta',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Guard: solo el dueño (es_superadmin) entra. Funciona en dev y producción
  // (no depende del middleware). Cualquier otro → al inicio.
  const sa = await resolverSuperadmin()
  if (!sa) redirect('/')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <span className="font-semibold">MediCuenta · Panel del dueño</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-foreground transition-colors"
          >
            <Stethoscope className="w-4 h-4" />
            <span className="hidden sm:inline">App de médico</span>
          </Link>
          {sa.nombre && <span className="text-sm text-[var(--color-muted-foreground)]">{sa.nombre}</span>}
        </div>
      </header>
      <main className="p-4 md:p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  )
}
