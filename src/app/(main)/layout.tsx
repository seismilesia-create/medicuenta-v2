import { Sidebar } from '@/shared/components/layout/sidebar'
import { BottomNav } from '@/shared/components/layout/bottom-nav'
import { AssistantSidePanel, MainShell } from '@/features/assistant/components'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const r = await resolverConsultorio()
  const ctx = r?.ctx ?? null
  const esSecretaria = ctx?.rol === 'secretaria'

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        nombre={ctx?.nombre ?? null}
        rol={ctx?.rol ?? 'medico'}
        medicos={ctx?.medicos ?? []}
        medicoActivoId={ctx?.medicoActivoId ?? null}
      />
      <MainShell>{children}</MainShell>
      <BottomNav rol={ctx?.rol ?? 'medico'} />
      {/* El asistente IA toca facturación: oculto para la secretaria. */}
      {!esSecretaria && <AssistantSidePanel />}
    </div>
  )
}
