import { Sidebar } from '@/shared/components/layout/sidebar'
import { BottomNav } from '@/shared/components/layout/bottom-nav'
import { AssistantSidePanel, MainShell, MedicoShell } from '@/features/assistant/components'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { AvisosSuscripcion } from '@/features/suscripcion/components/avisos-suscripcion'
import { PushNotificationPrompt } from '@/features/notifications/components/push-notification-prompt'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const r = await resolverConsultorio()
  const ctx = r?.ctx ?? null
  const esSecretaria = ctx?.rol === 'secretaria'

  // Piezas del shell (nav + página + asistente lateral). Se renderiza UNA vez.
  const shellInner = (
    <>
      <Sidebar
        nombre={ctx?.nombre ?? null}
        rol={ctx?.rol ?? 'medico'}
        medicos={ctx?.medicos ?? []}
        medicoActivoId={ctx?.medicoActivoId ?? null}
        // Sin contexto NO se asume Full: fallaba abierto y el menú mostraba el consultorio.
        plan={ctx?.plan ?? 'basico'}
        esSuperadmin={ctx?.esSuperadmin ?? false}
      />
      <MainShell>{children}</MainShell>
      <BottomNav rol={ctx?.rol ?? 'medico'} />
      {/* El asistente IA toca facturación: oculto para la secretaria. */}
      {!esSecretaria && <AssistantSidePanel />}
    </>
  )

  return (
    <div className="min-h-screen bg-background">
      {/*
        Fuera del shell: el médico en el home del asistente (celular) no ve el
        shell y se perdería el aviso. Solo al dueño: la secretaria no puede
        contratar, y un médico operando OTRO consultorio no es quien paga.
      */}
      {ctx && esDueño(ctx) && <AvisosSuscripcion acceso={ctx.acceso} />}
      {/*
        Médico: MedicoShell decide por ruta — en `/asistente` (celular) muestra el
        asistente a pantalla completa; en cualquier otra ruta muestra el shell en
        modo app (menú + BottomNav + FAB). Secretaria: shell responsive de siempre.
      */}
      {esSecretaria ? (
        <div>{shellInner}</div>
      ) : (
        <MedicoShell nombre={ctx?.nombre ?? null}>{shellInner}</MedicoShell>
      )}
      {/* Oferta de notificaciones push (overlay fixed, no depende del shell). */}
      <PushNotificationPrompt />
    </div>
  )
}
