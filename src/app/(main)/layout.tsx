import { Sidebar } from '@/shared/components/layout/sidebar'
import { BottomNav } from '@/shared/components/layout/bottom-nav'
import { AssistantSidePanel, MainShell, AssistantHome } from '@/features/assistant/components'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const r = await resolverConsultorio()
  const ctx = r?.ctx ?? null
  const esSecretaria = ctx?.rol === 'secretaria'

  // El shell completo (dashboards + nav + asistente lateral). En celular se
  // oculta para el médico (.only-web) y se reemplaza por el asistente puro.
  const shellWeb = (
    <div className={esSecretaria ? undefined : 'only-web'}>
      <Sidebar
        nombre={ctx?.nombre ?? null}
        rol={ctx?.rol ?? 'medico'}
        medicos={ctx?.medicos ?? []}
        medicoActivoId={ctx?.medicoActivoId ?? null}
        plan={ctx?.plan ?? 'full'}
        esSuperadmin={ctx?.esSuperadmin ?? false}
      />
      <MainShell>{children}</MainShell>
      <BottomNav rol={ctx?.rol ?? 'medico'} />
      {/* El asistente IA toca facturación: oculto para la secretaria. */}
      {!esSecretaria && <AssistantSidePanel />}
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {shellWeb}
      {/*
        Médico en CELULAR = asistente puro a pantalla completa (sin nav: no puede
        tocar turnos sin querer; la agenda la ve por su Google Calendar). La
        secretaria no tiene asistente, así que su shell responsive ya le sirve en
        el celular y no se le aplica este reemplazo.
      */}
      {!esSecretaria && (
        <div className="only-phone h-[100dvh] w-screen overflow-hidden">
          <AssistantHome nombre={ctx?.nombre ?? null} />
        </div>
      )}
    </div>
  )
}
