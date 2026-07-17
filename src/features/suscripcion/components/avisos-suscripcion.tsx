'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, AlertTriangle, X } from 'lucide-react'
import { debeMostrarModalSuscripcion, type Acceso } from '@/lib/admin/planes'

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
    setModalAbierto(debeMostrarModalSuscripcion(acceso, ultimoVisto, hoyISO()))
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
        <ModalSuscripcion
          rojo={esMorosa || dias === 1}
          Icono={esMorosa ? AlertTriangle : Clock}
          destacado={esMorosa ? null : dias === 1 ? '¡Último día!' : `${dias} días`}
          titulo={
            esMorosa
              ? 'No pudimos cobrar tu suscripción'
              : dias === 1
                ? 'Hoy se termina tu prueba gratis'
                : 'Te queda de prueba gratis'
          }
          cuerpo={
            esMorosa
              ? 'Estamos reintentando el cobro. Si no lo logramos, vas a perder el acceso a MediCuenta. Revisá tu tarjeta y actualizá el medio de pago.'
              : 'Después perdés la agenda, el asistente de WhatsApp, tus pacientes y las recetas. Tus datos quedan guardados.'
          }
          cta={esMorosa ? 'Actualizar pago' : 'Ver planes'}
          onCta={() => {
            cerrarModal()
            router.push('/plan')
          }}
          onCerrar={cerrarModal}
        />
      )}
    </>
  )
}

/**
 * El modal de "estás por perder el acceso": últimos días de prueba (R3) o cobro
 * fallido (R5).
 *
 * No usa ConfirmDialog a propósito, aunque sea "un modal con dos botones": ese es un
 * dialogo NEUTRO (mismo gris y mismo boton azul que "¿desconectar MercadoPago?"), y
 * dejaba toda la urgencia en el texto. Un modal se escanea antes de leerse, asi que
 * el mensaje tiene que entrar por el ojo: el color y el numero hacen el trabajo.
 *
 * `destacado` es el numero grande de la prueba. El moroso no lleva: no sabemos
 * cuantos reintentos le quedan hasta que lo diga el webhook (fase 5), y poner un
 * numero inventado seria mentirle.
 */
function ModalSuscripcion({
  rojo,
  Icono,
  destacado,
  titulo,
  cuerpo,
  cta,
  onCta,
  onCerrar,
}: {
  rojo: boolean
  Icono: typeof Clock
  destacado: string | null
  titulo: string
  cuerpo: string
  cta: string
  onCta: () => void
  onCerrar: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const tono = rojo
    ? { ring: 'ring-red-500/30', bg: 'bg-red-500/10', texto: 'text-red-500', boton: 'bg-red-500 hover:bg-red-600' }
    : { ring: 'ring-amber-500/30', bg: 'bg-amber-500/10', texto: 'text-amber-500', boton: 'bg-amber-500 hover:bg-amber-600' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={`w-full max-w-xs rounded-2xl border border-border bg-card p-6 text-center ring-4 ${tono.ring}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${tono.bg}`}>
          <Icono className={`h-7 w-7 ${tono.texto}`} strokeWidth={2} />
        </div>

        {/* El dato entra por el ojo: primero el numero, despues la explicacion. */}
        {destacado && (
          <p className={`mt-4 text-4xl font-bold leading-none tracking-tight ${tono.texto}`}>
            {destacado}
          </p>
        )}
        <p
          className={
            destacado
              ? 'mt-2 text-sm font-medium text-foreground'
              : `mt-4 text-lg font-bold leading-tight ${tono.texto}`
          }
        >
          {titulo}
        </p>

        <p className="mt-3 text-xs text-muted-foreground">{cuerpo}</p>

        <div className="mt-5 space-y-2">
          <button
            autoFocus
            onClick={onCta}
            className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${tono.boton}`}
          >
            {cta}
          </button>
          <button
            onClick={onCerrar}
            className="w-full rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}
