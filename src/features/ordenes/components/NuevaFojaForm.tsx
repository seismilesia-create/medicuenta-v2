'use client'

import { useRef, useState } from 'react'
import { Mic, MicOff, Loader2, Check, Pencil, RotateCcw } from 'lucide-react'
import { createOrden } from '@/actions/ordenes'
import { createClient } from '@/lib/supabase/client'
import { useVoiceInput } from '@/features/assistant/hooks/useVoiceInput'
import {
  OBRAS_SOCIALES,
  ROL_MEDICO_LABELS,
  type Prestacion,
  type OrdenFormData,
  type RolMedico,
} from '../types/ordenes'

const PRESTACION_SELECT = 'id, codigo, detalle, honorarios, gastos, total, seccion, categoria, obra_social'

type StepKey = 'paciente' | 'obra_social' | 'principal' | 'adicional' | 'rol'

const STEPS: { key: StepKey; label: string; pregunta: string; ayuda: string }[] = [
  { key: 'paciente', label: 'Paciente', pregunta: '¿Nombre y apellido del paciente?', ayuda: 'Decí el nombre completo.' },
  { key: 'obra_social', label: 'Obra social', pregunta: '¿Obra social?', ayuda: 'Ej: OSEP, PAMI, Swiss Medical…' },
  { key: 'principal', label: 'Cirugía principal', pregunta: '¿Cuál fue la cirugía principal?', ayuda: 'Decí el nombre de la cirugía.' },
  { key: 'adicional', label: 'Cirugía adicional', pregunta: '¿Hubo una cirugía adicional?', ayuda: 'Si no hubo, decí "no".' },
  { key: 'rol', label: 'Rol', pregunta: '¿Tu rol? Cirujano principal o ayudante.', ayuda: '' },
]

function quitarAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function matchOs(t: string): string {
  const low = t.toLowerCase()
  for (const os of OBRAS_SOCIALES) {
    if (low.includes(os.toLowerCase()) || os.toLowerCase().includes(low)) return os
  }
  return t.trim().toUpperCase()
}

function detectarRol(t: string): RolMedico | '' {
  const low = quitarAcentos(t.toLowerCase())
  if (low.includes('ayudante')) return 'ayudante'
  if (low.includes('principal') || low.includes('cirujano')) return 'cirujano_principal'
  return ''
}

function esNegacion(t: string): boolean {
  const low = quitarAcentos(t.toLowerCase()).trim()
  return /^(no|ninguna|ninguno|nada|sin adicional|no hubo|no hay)\b/.test(low)
}

async function buscarCirugia(obraSocial: string, termino: string): Promise<Prestacion | null> {
  const t = quitarAcentos(termino).trim()
  if (t.length < 3) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('prestaciones')
    .select(PRESTACION_SELECT)
    .eq('obra_social', obraSocial || 'OSEP')
    .ilike('detalle', `%${t}%`)
    .limit(1)
  return data && data.length ? (data[0] as Prestacion) : null
}

export function NuevaFojaForm() {
  // stepIdx 0..4 = capturando ese campo; 5 = resumen.
  const [stepIdx, setStepIdx] = useState(0)
  // Cuando se edita un campo desde el resumen, guarda su key (si no, null).
  const [editando, setEditando] = useState<StepKey | null>(null)

  const targetRef = useRef<StepKey | null>(null) // a qué campo va la próxima respuesta

  const [paciente, setPaciente] = useState('')
  const [obraSocial, setObraSocial] = useState('')
  const [principal, setPrincipal] = useState<Prestacion | null>(null)
  const [principalTexto, setPrincipalTexto] = useState('')
  const [adicional, setAdicional] = useState<Prestacion | null>(null)
  const [adicionalTexto, setAdicionalTexto] = useState('')
  const [adicionalResp, setAdicionalResp] = useState(false)
  const [rol, setRol] = useState<RolMedico | ''>('')

  const [procesando, setProcesando] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function aplicar(key: StepKey, t: string) {
    if (key === 'paciente') setPaciente(t)
    else if (key === 'obra_social') setObraSocial(matchOs(t))
    else if (key === 'principal') {
      setProcesando(true); setPrincipalTexto(t); setPrincipal(await buscarCirugia(obraSocial, t)); setProcesando(false)
    } else if (key === 'adicional') {
      setAdicionalResp(true)
      if (esNegacion(t)) { setAdicional(null); setAdicionalTexto('') }
      else { setProcesando(true); setAdicionalTexto(t); setAdicional(await buscarCirugia(obraSocial, t)); setProcesando(false) }
    } else if (key === 'rol') setRol(detectarRol(t))
  }

  async function onHeard(transcript: string) {
    const t = transcript.trim()
    if (!t) return
    setError(null)
    const editKey = targetRef.current
    if (editKey) {
      // Edición de un campo puntual desde el resumen.
      await aplicar(editKey, t)
      targetRef.current = null
      setEditando(null)
    } else {
      // Captura secuencial.
      const key = STEPS[stepIdx].key
      await aplicar(key, t)
      setStepIdx((i) => i + 1)
    }
  }

  const voice = useVoiceInput({ onFinalTranscript: onHeard })

  function hablarCampo() {
    targetRef.current = null
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  function editarCampo(key: StepKey) {
    targetRef.current = key
    setEditando(key)
    voice.start()
  }

  function reiniciar() {
    voice.abort()
    targetRef.current = null
    setEditando(null)
    setStepIdx(0)
    setPaciente(''); setObraSocial('')
    setPrincipal(null); setPrincipalTexto('')
    setAdicional(null); setAdicionalTexto(''); setAdicionalResp(false)
    setRol(''); setError(null)
  }

  async function handleGuardar() {
    setLoading(true); setError(null)
    voice.abort()
    const formData: OrdenFormData = {
      tipo: 'obra_social',
      nombre_paciente: paciente,
      fecha_atencion: new Date().toISOString().split('T')[0],
      monto_plus: 0,
      agente_facturador: 'circulo_medico',
      obra_social: obraSocial || 'OSEP',
      firma_paciente: false,
      codigo_practica: principal?.codigo ?? undefined,
      nombre_practica: principal?.detalle ?? principalTexto ?? undefined,
      honorario_calculado: Number(principal?.total ?? 0),
      nivel: 2,
      cirugia_adicional: adicional?.detalle ?? (adicionalTexto || undefined),
      cirugia_adicional_codigo: adicional?.codigo ?? undefined,
      cirugia_adicional_honorario: adicional?.total ?? undefined,
      rol_medico: rol || undefined,
    }
    const result = await createOrden(formData)
    if (result?.error) { setError(result.error); setLoading(false) }
    // success → redirect a /ordenes
  }

  // Valor mostrado + si está completo, por campo.
  function valorDe(key: StepKey): { valor: string; ok: boolean } {
    switch (key) {
      case 'paciente': return { valor: paciente, ok: !!paciente }
      case 'obra_social': return { valor: obraSocial, ok: !!obraSocial }
      case 'principal': return { valor: principal ? `${principal.codigo} · ${principal.detalle}` : principalTexto, ok: !!(principal || principalTexto) }
      case 'adicional': return { valor: adicional ? `${adicional.codigo} · ${adicional.detalle}` : (adicionalTexto || (adicionalResp ? 'Sin adicional' : '')), ok: adicionalResp }
      case 'rol': return { valor: rol ? ROL_MEDICO_LABELS[rol] : '', ok: !!rol }
    }
  }

  const enResumen = stepIdx >= STEPS.length
  const totalHonorarios = Number(principal?.total ?? 0) + Number(adicional?.total ?? 0)
  const escuchando = voice.isListening

  return (
    <div className="max-w-2xl space-y-6">
      {/* Progreso */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s.key} className="h-1.5 flex-1 rounded-full" style={{ background: valorDe(s.key).ok ? 'var(--color-success)' : (i === stepIdx && !enResumen ? 'var(--color-primary)' : 'var(--color-border)') }} />
        ))}
      </div>

      {/* Pregunta del paso actual (solo mientras se captura) */}
      {!enResumen && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted-foreground)' }}>
            Paso {stepIdx + 1} de {STEPS.length}
          </p>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)' }}>{STEPS[stepIdx].pregunta}</h2>
          {STEPS[stepIdx].ayuda && <p className="text-sm mt-1.5" style={{ color: 'var(--color-muted-foreground)' }}>{STEPS[stepIdx].ayuda}</p>}

          <button
            type="button"
            onClick={hablarCampo}
            disabled={!voice.isSupported || procesando}
            className="mt-6 inline-flex items-center gap-2 px-6 py-4 rounded-2xl text-base font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: escuchando ? 'var(--color-error)' : 'var(--color-primary)' }}
          >
            {procesando ? <Loader2 className="h-5 w-5 animate-spin" /> : escuchando ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            {procesando ? 'Buscando...' : escuchando ? 'Detener' : 'Hablar'}
          </button>

          <div className="h-5 mt-3 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {escuchando && (voice.interimTranscript || 'Te escucho...')}
            {!voice.isSupported && 'Este dispositivo no soporta dictado por voz.'}
          </div>
        </div>
      )}

      {/* Resumen (al terminar) */}
      {enResumen && (
        <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>Revisá la foja</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)' }}>Tocá el 🎤 de un campo para corregirlo hablando.</p>
          {totalHonorarios > 0 && (
            <p className="text-sm mb-4 font-mono" style={{ color: 'var(--color-success)' }}>Honorario total: ${totalHonorarios.toLocaleString('es-AR')}</p>
          )}
        </div>
      )}

      {/* Panel de campos: se van tildando en verde; en el resumen son editables */}
      <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {STEPS.map((s, i) => {
          const { valor, ok } = valorDe(s.key)
          const activo = !enResumen && i === stepIdx
          const editandoEste = editando === s.key
          return (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
              style={{ background: activo || editandoEste ? 'var(--color-background)' : 'transparent', border: activo || editandoEste ? '1px solid var(--color-primary)' : '1px solid transparent' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-5 w-5 items-center justify-center rounded-full shrink-0" style={{ background: ok ? 'var(--color-success)' : 'var(--color-border)' }}>
                  {ok && <Check className="h-3 w-3 text-white" />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{s.label}</p>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                    {editandoEste && escuchando ? (voice.interimTranscript || 'Te escucho...') : (valor || '…')}
                  </p>
                </div>
              </div>
              {enResumen && (
                <button
                  type="button"
                  onClick={() => editarCampo(s.key)}
                  disabled={procesando || (escuchando && !editandoEste)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 disabled:opacity-40"
                  style={{ background: editandoEste ? 'var(--color-error)' : 'var(--color-background)', border: '1px solid var(--color-border)', color: editandoEste ? '#fff' : 'var(--color-foreground)' }}
                >
                  {editandoEste ? <MicOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editandoEste ? 'Grabando' : 'Editar'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

      {/* Acciones */}
      <div className="flex gap-3">
        {enResumen && (
          <button type="button" onClick={handleGuardar} disabled={loading} className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
            {loading ? 'Guardando...' : 'Guardar foja'}
          </button>
        )}
        <button type="button" onClick={reiniciar} className="inline-flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}>
          <RotateCcw className="h-4 w-4" /> Empezar de nuevo
        </button>
        <a href="/ordenes" className="px-4 py-3 rounded-lg text-sm font-medium transition-colors text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}>
          Cancelar
        </a>
      </div>
    </div>
  )
}
