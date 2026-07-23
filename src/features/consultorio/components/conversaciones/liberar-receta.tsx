'use client'

import { useState } from 'react'
import { getRecetasPendientesConversacion, liberarReceta } from '@/actions/consultorio-recetas'
import { nacionalDeWhatsappAr, normalizarWhatsappAr } from '@/lib/whatsapp/numeroAr'

type Pendiente = { id: string; paciente_nombre: string; nro_receta: string | null; monto: number | null; created_at: string }

interface Props {
  conversacionId: string
  contactoNombre: string | null
  contactoTelefono: string
  /** Ventana de 24 h de Meta. Cerrada = el PDF no sale ahora, sale cuando el paciente escriba. */
  ventanaAbierta: boolean
}

export function LiberarRecetaButton({ conversacionId, contactoNombre, contactoTelefono, ventanaAbierta }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [dni, setDni] = useState('')
  const [buscado, setBuscado] = useState(false)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [sel, setSel] = useState<string>('')
  const [nroOrden, setNroOrden] = useState('')
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'guardando'>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  const destino = `${contactoNombre ? `${contactoNombre} · ` : ''}+54 ${nacionalDeWhatsappAr(contactoTelefono)}`

  async function buscar() {
    if (dni.replace(/\D/g, '').length < 7) { setMsg('Ingresá el DNI del paciente (mínimo 7 dígitos).'); return }
    setEstado('cargando'); setMsg(null); setSel('')
    const res = await getRecetasPendientesConversacion(conversacionId, dni)
    setEstado('idle'); setBuscado(true)
    if ('error' in res) { setPendientes([]); setMsg(res.error ?? 'Ocurrió un error al buscar las recetas.'); return }
    setPendientes(res.recetas)
    if (res.recetas.length === 1) setSel(res.recetas[0].id)
  }

  async function confirmar() {
    if (!sel || !nroOrden.trim()) { setMsg('Elegí la receta y escribí el N° de orden.'); return }
    setEstado('guardando'); setMsg(null)
    const res = await liberarReceta({ conversacionId, recetaId: sel, nroOrden: nroOrden.trim() })
    setEstado('idle')
    if ('error' in res) { setMsg(res.error ?? 'Ocurrió un error al liberar la receta.'); return }

    // La receta pudo quedar atada a otro WhatsApp de antes (candado anti-secuestro): si el PDF
    // no va al número de esta conversación, la secretaria tiene que saberlo.
    const otroNumero =
      !!res.telefonoDestino && normalizarWhatsappAr(res.telefonoDestino) !== normalizarWhatsappAr(contactoTelefono)
    if (otroNumero) {
      setMsg('⚠️ Esta receta ya se estaba gestionando desde otro WhatsApp: el PDF va a ese número, no al de esta conversación.')
    } else if (res.entregada) {
      setMsg('✅ Receta liberada y enviada al paciente por WhatsApp.')
    } else {
      setMsg('✅ Receta liberada. El PDF todavía no salió (pasaron más de 24 h del último mensaje del paciente): decile que le escriba cualquier cosa al asistente y la recibe al instante.')
    }
    setPendientes((p) => p.filter((x) => x.id !== sel)); setSel(''); setNroOrden('')
  }

  function cerrar() {
    setAbierto(false); setDni(''); setBuscado(false); setPendientes([]); setSel(''); setNroOrden(''); setMsg(null); setEstado('idle')
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="text-sm px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 text-foreground">
        Liberar receta por orden de consulta
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        El PDF se envía al WhatsApp de esta conversación: <span className="font-medium text-foreground">{destino}</span>
      </p>

      <div className="flex gap-2">
        <input value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" placeholder="DNI del paciente"
          onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground" />
        <button type="button" onClick={buscar} disabled={estado === 'cargando'}
          className="text-sm px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 text-foreground disabled:opacity-50">
          {estado === 'cargando' ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {buscado && estado !== 'cargando' && (
        pendientes.length === 0 ? (
          <p className="text-muted-foreground">No hay recetas pendientes para ese DNI.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {pendientes.map((r) => (
                <li key={r.id}>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="receta" checked={sel === r.id} onChange={() => setSel(r.id)} />
                    <span>{r.paciente_nombre}{r.nro_receta ? ` · N° ${r.nro_receta}` : ''}{r.monto != null ? ` · $${r.monto.toLocaleString('es-AR')}` : ''}</span>
                  </label>
                </li>
              ))}
            </ul>
            <input value={nroOrden} onChange={(e) => setNroOrden(e.target.value)} placeholder="N° de orden de consulta"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground" />
            {!ventanaAbierta && (
              <p className="text-xs text-blue-500">
                ⏳ La ventana de 24 h está cerrada: al liberar, la receta va a salir sola apenas el paciente vuelva a escribir.
              </p>
            )}
            <button type="button" onClick={confirmar} disabled={estado === 'guardando'}
              className="text-sm px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
              {estado === 'guardando' ? 'Liberando…' : 'Liberar y enviar'}
            </button>
          </>
        )
      )}

      {msg && <p className="text-muted-foreground">{msg}</p>}
      <button type="button" onClick={cerrar} className="text-xs text-muted-foreground underline">Cerrar</button>
    </div>
  )
}
