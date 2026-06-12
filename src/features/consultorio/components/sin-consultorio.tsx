import { ShieldOff } from 'lucide-react'

/** Secretaria sin vínculo activo (nunca aceptado o revocado por el médico). */
export function SinConsultorio() {
  return (
    <div className="p-6 md:p-10 max-w-lg mx-auto">
      <div className="rounded-2xl border border-border p-6 text-center space-y-3">
        <ShieldOff className="w-8 h-8 mx-auto text-[var(--color-muted-foreground)]" />
        <h1 className="text-lg font-semibold">No tenés un consultorio asignado</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Tu acceso fue revocado o todavía no te vincularon. Pedile al médico que te invite desde
          «Asistente de turnos» para volver a operar la agenda.
        </p>
      </div>
    </div>
  )
}
