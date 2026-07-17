'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, AlertTriangle, X } from 'lucide-react'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import { debeMostrarModalPrueba, type Acceso } from '@/lib/admin/planes'

/**
 * Avisos de suscripción del médico (spec F4.3 §8, R3/R5). Escala solo:
 *
 *  - prueba, 5+ días  → chip pasivo arriba, descartable. Recuerda sin molestar.
 *  - prueba, ≤4 días  → el chip se pone ámbar Y aparece un modal, 1 vez por día.
 *  - morosa           → chip rojo permanente, NO descartable: le está por caer el
 *                       acceso y el cobro ya falló.
 *
 * Va flotando en el root del layout y no dentro del shell a propósito: el médico
 * en celular no ve el shell (ve el asistente a pantalla completa), y si esto
 * viviera adentro no se enteraría de que la prueba corre hasta que lo bloqueemos.
 */
const KEY_MODAL = 'medicuenta:prueba_modal_visto'
const hoyISO = () => new Date().toISOString().slice(0, 10)

export function AvisosSuscripcion({ acceso }: { acceso: Acceso }) {
  const router = useRouter()
  const [chipCerrado, setChipCerrado] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)

  const esUrgente = acceso.acceso === 'aviso' && acceso.motivo === 'trial_urgente'

  // El modal se decide DESPUÉS del montaje: localStorage no existe en el server, y
  // arrancar abierto lo haría parpadear en cada carga antes de saber si ya lo vio.
  // La regla (cuándo y cada cuánto) vive en debeMostrarModalPrueba, que está testeada.
  useEffect(() => {
    let ultimoVisto: string | null = null
    try {
      ultimoVisto = localStorage.getItem(KEY_MODAL)
    } catch {
      // Incógnito o storage bloqueado: seguimos como si nunca lo hubiera visto.
      // Preferimos avisarle de más a que se le venza la prueba sin enterarse.
    }
    setModalAbierto(debeMostrarModalPrueba(acceso, ultimoVisto, hoyISO()))
  }, [acceso])

  function cerrarModal() {
    setModalAbierto(false)
    try {
      localStorage.setItem(KEY_MODAL, hoyISO())
    } catch {
      // Sin storage lo vuelve a ver en la próxima carga. Es molesto, no roto.
    }
  }

  if (acceso.acceso !== 'aviso') return null

  const esMorosa = acceso.motivo === 'morosa'
  const dias = esMorosa ? 0 : acceso.diasRestantes

  // El chip rojo de morosa no se puede cerrar: es plata que ya no entró.
  const chipVisible = esMorosa || !chipCerrado

  const texto = esMorosa
    ? 'No pudimos cobrar tu suscripción'
    : dias === 1
      ? '¡Último día de prueba!'
      : esUrgente
        ? `¡Últimos ${dias} días de prueba!`
        : `Te quedan ${dias} días de prueba`

  const color = esMorosa
    ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
    : esUrgente
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'border-border bg-card text-muted-foreground'

  return (
    <>
      {chipVisible && (
        <div
          className={`fixed top-16 md:top-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-xs shadow-lg backdrop-blur ${color}`}
          role="status"
        >
          {esMorosa ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          ) : (
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          )}
          <span className="font-medium">{texto}</span>
          <Link href="/plan" className="font-semibold underline underline-offset-2 hover:opacity-80">
            {esMorosa ? 'Actualizar pago' : 'Ver planes'}
          </Link>
          {!esMorosa && (
            <button
              onClick={() => setChipCerrado(true)}
              aria-label="Cerrar aviso"
              className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      {modalAbierto && (
        <ConfirmDialog
          titulo={dias === 1 ? '¡Último día de prueba gratis!' : `¡Últimos ${dias} días de prueba gratuitos!`}
          mensaje="Contratá tu plan para no perder tus funcionalidades premium: la agenda, el asistente de WhatsApp, tus pacientes y las recetas."
          confirmLabel="Ver planes"
          cancelLabel="Ahora no"
          onConfirm={() => {
            cerrarModal()
            router.push('/plan')
          }}
          onCancel={cerrarModal}
        />
      )}
    </>
  )
}
