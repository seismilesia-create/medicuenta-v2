import { LogoMark } from '@/shared/components/logo'

/**
 * Mockup de teléfono con una conversación estilizada del asistente.
 * La conversación replica flujos REALES del bot (turnos + receta con link de
 * pago) sin inventar identidades ni datos: es una recreación visual, no una
 * captura. Las capturas reales van en la sección Demo.
 */

function BurbujaPaciente({ children, hora }: { children: React.ReactNode; hora: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary-100 px-3.5 py-2 text-[13px] leading-snug text-primary-900 shadow-sm">
        {children}
        <span className="ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10px] text-primary-700/70">
          {hora}
          <svg viewBox="0 0 16 10" className="h-2.5 w-4 fill-current" aria-hidden="true">
            <path d="M11.07.65 5.4 6.9 3.07 4.6l-1 1.02 3.4 3.36L12.1 1.6l-1.03-.95Z" />
            <path d="M14.93.65 9.26 6.9l-.6-.6-.95 1.05 1.62 1.6L15.96 1.6l-1.03-.95Z" />
          </svg>
        </span>
      </div>
    </div>
  )
}

function BurbujaBot({ children, hora }: { children: React.ReactNode; hora: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-card px-3.5 py-2 text-[13px] leading-snug text-card-foreground shadow-sm ring-1 ring-border/60">
        {children}
        <span className="ml-2 inline-block translate-y-0.5 text-[10px] text-muted-foreground">{hora}</span>
      </div>
    </div>
  )
}

export function PhoneMockup({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Glow de marca detrás del teléfono */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary-200/60 via-primary-100/30 to-transparent blur-2xl dark:from-primary-700/30 dark:via-primary-800/20"
      />

      <div className="mx-auto w-[290px] rounded-[2.6rem] border border-border bg-foreground/[0.04] p-2 shadow-2xl shadow-primary-900/10 sm:w-[310px] dark:bg-white/5">
        <div className="overflow-hidden rounded-[2.1rem] bg-secondary">
          {/* Barra superior del chat */}
          <div className="relative flex items-center gap-2.5 bg-card px-4 pb-3 pt-5 shadow-sm">
            <div className="absolute left-1/2 top-1.5 h-1 w-16 -translate-x-1/2 rounded-full bg-foreground/10" aria-hidden="true" />
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 ring-1 ring-primary-100 dark:bg-primary-900/40 dark:ring-primary-800">
              <LogoMark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight">MediCuenta · Asistente</p>
              <p className="text-[11px] leading-tight text-success">en línea</p>
            </div>
          </div>

          {/* Conversación */}
          <div className="space-y-2.5 px-3 py-4">
            <BurbujaPaciente hora="09:12">Hola! Quería un turno con el doctor</BurbujaPaciente>
            <BurbujaBot hora="09:12">
              ¡Hola! 👋 Claro. Para esta semana tengo <strong>miércoles 10:30</strong> o{' '}
              <strong>jueves 11:00</strong>. ¿Cuál te queda mejor?
            </BurbujaBot>
            <BurbujaPaciente hora="09:13">Jueves puede ser</BurbujaPaciente>
            <BurbujaBot hora="09:13">
              ✅ Listo, quedaste para el <strong>jueves a las 11:00</strong>. Traé tu credencial y la
              orden de consulta. ¿Algo más?
            </BurbujaBot>
            <BurbujaPaciente hora="09:14">Sí, me quedó una receta pendiente</BurbujaPaciente>
            <BurbujaBot hora="09:14">
              La tengo acá 📄 Te paso el link de pago y apenas se acredite te la envío en PDF.
            </BurbujaBot>
          </div>

          {/* Barra de escritura (decorativa) */}
          <div className="flex items-center gap-2 px-3 pb-4">
            <div className="flex h-9 flex-1 items-center rounded-full bg-card px-4 text-[12px] text-muted-foreground ring-1 ring-border/60">
              Escribí un mensaje…
            </div>
            <div className="gradient-medical grid h-9 w-9 shrink-0 place-items-center rounded-full text-white" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-px fill-current">
                <path d="M3.4 20.4 20.85 12 3.4 3.6l-.01 6.53L14.4 12 3.39 13.87l.01 6.53Z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
