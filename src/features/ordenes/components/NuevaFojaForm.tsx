'use client'

import { useRef, useState } from 'react'
import { Mic, MicOff, Loader2, Check, RotateCcw } from 'lucide-react'
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

type StepKey = 'paciente' | 'obra_social' | 'principal' | 'adicional' | 'rol' | 'confirmar'

const STEPS: { key: StepKey; pregunta: string; ayuda: string }[] = [
  { key: 'paciente', pregunta: '¿Nombre y apellido del paciente?', ayuda: 'Decí el nombre completo.' },
  { key: 'obra_social', pregunta: '¿Obra social?', ayuda: 'Ej: OSEP, PAMI, Swiss Medical…' },
  { key: 'principal', pregunta: '¿Cuál fue la cirugía principal?', ayuda: 'Decí el nombre de la cirugía.' },
  { key: 'adicional', pregunta: '¿Hubo una cirugía adicional?', ayuda: 'Si no hubo, decí "no".' },
  { key: 'rol', pregunta: '¿Tu rol? Cirujano principal o ayudante.', ayuda: '' },
  { key: 'confirmar', pregunta: 'Revisá y confirmá', ayuda: 'Decí "sí" para guardar, o "no" para empezar de nuevo.' },
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

function esAfirmacion(t: string): boolean {
  const low = quitarAcentos(t.toLowerCase()).trim()
  return /\b(si|sí|dale|confirmo|correcto|guardar|ok|listo)\b/.test(low)
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
  const [stepIdx, setStepIdx] = useState(0)
  const stepRef = useRef(0)
  stepRef.current = stepIdx

  const [paciente, setPaciente] = useState('')
  const [obraSocial, setObraSocial] = useState('')
  const [principal, setPrincipal] = useState<Prestacion | null>(null)
  const [principalTexto, setPrincipalTexto] = useState('')
  const [adicional, setAdicional] = useState<Prestacion | null>(null)
  const [adicionalTexto, setAdicionalTexto] = useState('')
  const [rol, setRol] = useState<RolMedico | ''>('')

  const [procesando, setProcesando] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function avanzar() {
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))
  }

  async function onHeard(transcript: string) {
    const t = transcript.trim()
    if (!t) return
    setError(null)
    const key = STEPS[stepRef.current].key

    if (key === 'paciente') {
      setPaciente(t)
      avanzar()
    } else if (key === 'obra_social') {
      setObraSocial(matchOs(t))
      avanzar()
    } else if (key === 'principal') {
      setProcesando(true)
      setPrincipalTexto(t)
      setPrincipal(await buscarCirugia(obraSocial, t))
      setProcesando(false)
      avanzar()
    } else if (key === 'adicional') {
      if (esNegacion(t)) {
        setAdicional(null)
        setAdicionalTexto('')
      } else {
        setProcesando(true)
        setAdicionalTexto(t)
        setAdicional(await buscarCirugia(obraSocial, t))
        setProcesando(false)
      }
      avanzar()
    } else if (key === 'rol') {
      setRol(detectarRol(t))
      avanzar()
    } else if (key === 'confirmar') {
      if (esAfirmacion(t)) await handleGuardar()
      else if (esNegacion(t)) reiniciar()
    }
  }

  const voice = useVoiceInput({ onFinalTranscript: onHeard })

  function hablar() {
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  function reiniciar() {
    setStepIdx(0)
    setPaciente(''); setObraSocial('')
    setPrincipal(null); setPrincipalTexto('')
    setAdicional(null); setAdicionalTexto('')
    setRol(''); setError(null)
  }

  async function handleGuardar() {
    setLoading(true)
    setError(null)
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
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // success → redirect a /ordenes
  }

  const step = STEPS[stepIdx]
  const totalHonorarios = Number(principal?.total ?? 0) + Number(adicional?.total ?? 0)

  // Resumen de lo capturado hasta ahora (para ver cómo se va llenando).
  const filas: { label: string; valor: string; ok: boolean }[] = [
    { label: 'Paciente', valor: paciente, ok: !!paciente },
    { label: 'Obra social', valor: obraSocial, ok: !!obraSocial },
    { label: 'Cirugía principal', valor: principal ? `${principal.codigo} · ${principal.detalle}` : principalTexto, ok: !!(principal || principalTexto) },
    { label: 'Cirugía adicional', valor: adicional ? `${adicional.codigo} · ${adicional.detalle}` : (adicionalTexto || '—'), ok: stepIdx > 3 },
    { label: 'Rol', valor: rol ? ROL_MEDICO_LABELS[rol] : '', ok: !!rol },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      {/* Progreso */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s.key} className="h-1.5 flex-1 rounded-full" style={{ background: i <= stepIdx ? 'var(--color-primary)' : 'var(--color-border)' }} />
        ))}
      </div>

      {/* Pregunta + micrófono */}
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted-foreground)' }}>
          Paso {stepIdx + 1} de {STEPS.length}
        </p>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)' }}>{step.pregunta}</h2>
        {step.ayuda && <p className="text-sm mt-1.5" style={{ color: 'var(--color-muted-foreground)' }}>{step.ayuda}</p>}

        {step.key === 'confirmar' ? (
          <div className="mt-5 space-y-2 text-left rounded-xl p-4" style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
            {filas.map((f) => (
              <div key={f.label} className="flex justify-between gap-3 text-sm">
                <span style={{ color: 'var(--color-muted-foreground)' }}>{f.label}</span>
                <span className="text-right font-medium" style={{ color: 'var(--color-foreground)' }}>{f.valor || '—'}</span>
              </div>
            ))}
            {totalHonorarios > 0 && (
              <div className="flex justify-between gap-3 text-sm pt-2 mt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <span style={{ color: 'var(--color-muted-foreground)' }}>Honorario total</span>
                <span className="text-right font-bold font-mono" style={{ color: 'var(--color-success)' }}>${totalHonorarios.toLocaleString('es-AR')}</span>
              </div>
            )}
          </div>
        ) : null}

        <button
          type="button"
          onClick={hablar}
          disabled={!voice.isSupported || procesando || loading}
          className="mt-6 inline-flex items-center gap-2 px-6 py-4 rounded-2xl text-base font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: voice.isListening ? 'var(--color-error)' : 'var(--color-primary)' }}
        >
          {procesando || loading ? <Loader2 className="h-5 w-5 animate-spin" /> : voice.isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {loading ? 'Guardando...' : procesando ? 'Buscando...' : voice.isListening ? 'Detener' : step.key === 'confirmar' ? 'Responder por voz' : 'Hablar'}
        </button>

        <div className="h-5 mt-3 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          {voice.isListening && (voice.interimTranscript || 'Te escucho...')}
          {!voice.isSupported && 'Este dispositivo no soporta dictado por voz.'}
        </div>

        {error && <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>{error}</p>}
      </div>

      {/* Lo capturado (se ve cómo se llena) */}
      <div className="rounded-2xl p-5 space-y-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {filas.slice(0, stepIdx === STEPS.length - 1 ? 5 : stepIdx + 1).map((f) => (
          <div key={f.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2" style={{ color: 'var(--color-muted-foreground)' }}>
              {f.ok && f.valor ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} /> : <span className="w-3.5" />}
              {f.label}
            </span>
            <span className="text-right font-medium" style={{ color: 'var(--color-foreground)' }}>{f.valor || '…'}</span>
          </div>
        ))}
      </div>

      {/* Acciones (tap, sin teclado) */}
      <div className="flex gap-3">
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
