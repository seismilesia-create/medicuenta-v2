'use client'

import { useRef, useState } from 'react'
import { hoyArgentina } from '@/shared/lib/fechas'
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

const MSG_ERROR: Record<StepKey, string> = {
  paciente: '',
  obra_social: 'No reconocí la obra social. Tocá Hablar y repetí (ej: OSEP, PAMI).',
  principal: 'No encontré esa cirugía en el nomenclador. Repetí el nombre.',
  adicional: 'No encontré esa cirugía. Repetí, o decí "no".',
  rol: 'Decí "cirujano principal" o "ayudante".',
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function tituloCase(s: string): string {
  return s.trim().toLowerCase().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function similitud(a: string, b: string): number {
  const A = normalizar(a), B = normalizar(b)
  if (!A || !B) return 0
  return 1 - levenshtein(A, B) / Math.max(A.length, B.length)
}

// OS tolerante: substring, y si no, la más parecida (umbral).
function matchOsFuzzy(t: string): string {
  const low = normalizar(t)
  for (const os of OBRAS_SOCIALES) {
    const o = normalizar(os)
    if (low.includes(o) || o.includes(low)) return os
  }
  let best = '', score = 0
  for (const os of OBRAS_SOCIALES) {
    const s = similitud(low, os)
    if (s > score) { score = s; best = os }
  }
  return score >= 0.5 ? best : ''
}

function detectarRol(t: string): RolMedico | '' {
  const low = normalizar(t)
  if (low.includes('ayudante') || low.includes('ayude') || low.includes('asisti')) return 'ayudante'
  if (low.includes('principal') || low.includes('cirujano') || low.includes('opere') || low.includes('titular')) return 'cirujano_principal'
  return ''
}

function esNegacion(t: string): boolean {
  const low = normalizar(t)
  return /^(no|ninguna|ninguno|nada|sin adicional|no hubo|no hay)\b/.test(low)
}

// Cirugía tolerante: busca por el término y por palabras largas (con y sin
// acentos), primero en tu OS y si no hay, en todas. Rankea por similitud.
async function buscarCirugia(obraSocial: string, termino: string): Promise<Prestacion | null> {
  const orig = termino.toLowerCase().trim()
  const norm = normalizar(termino)
  if (norm.length < 3) return null
  const supabase = createClient()

  const palabras = [...orig.split(/\s+/), ...norm.split(/\s+/)].filter((w) => w.length >= 4)
  const claves = Array.from(new Set([orig, norm, ...palabras]))

  // 1) con filtro de OS  2) sin filtro (las cirugías pueden no estar bajo esa OS)
  for (const conOs of [true, false] as const) {
    let candidatos: Prestacion[] = []
    for (const k of claves) {
      let q = supabase.from('prestaciones').select(PRESTACION_SELECT).ilike('detalle', `%${k}%`).limit(20)
      if (conOs) q = q.eq('obra_social', obraSocial || 'OSEP')
      const { data } = await q
      if (data && data.length) { candidatos = data as Prestacion[]; break }
    }
    if (candidatos.length) {
      let best: Prestacion | null = null, score = -1
      for (const c of candidatos) {
        const s = similitud(termino, c.detalle)
        if (s > score) { score = s; best = c }
      }
      return best
    }
  }
  return null
}

export function NuevaFojaForm() {
  const [stepIdx, setStepIdx] = useState(0)
  const [editando, setEditando] = useState<StepKey | null>(null)
  const targetRef = useRef<StepKey | null>(null)

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

  // Devuelve true si capturó un valor VÁLIDO (acotado); false si no reconoció.
  async function aplicar(key: StepKey, t: string): Promise<boolean> {
    if (key === 'paciente') { setPaciente(tituloCase(t)); return true }
    if (key === 'obra_social') { const os = matchOsFuzzy(t); if (!os) return false; setObraSocial(os); return true }
    if (key === 'principal') {
      setProcesando(true); const p = await buscarCirugia(obraSocial, t); setProcesando(false)
      setPrincipalTexto(t); setPrincipal(p); return !!p
    }
    if (key === 'adicional') {
      setAdicionalResp(true)
      if (esNegacion(t)) { setAdicional(null); setAdicionalTexto(''); return true }
      setProcesando(true); const p = await buscarCirugia(obraSocial, t); setProcesando(false)
      setAdicionalTexto(t); setAdicional(p); return !!p
    }
    if (key === 'rol') { const r = detectarRol(t); if (!r) return false; setRol(r); return true }
    return false
  }

  async function onHeard(transcript: string) {
    const t = transcript.trim()
    if (!t) return
    setError(null)
    const editKey = targetRef.current
    const key = editKey ?? STEPS[stepIdx].key
    const ok = await aplicar(key, t)
    if (!ok) {
      setError(MSG_ERROR[key])
      return // no avanza ni cierra edición: que repita
    }
    if (editKey) { targetRef.current = null; setEditando(null) }
    else setStepIdx((i) => i + 1)
  }

  const voice = useVoiceInput({ onFinalTranscript: onHeard })

  function hablarCampo() {
    targetRef.current = null
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  function editarCampo(key: StepKey) {
    setError(null)
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
      fecha_atencion: hoyArgentina(),
      monto_plus: 0,
      agente_facturador: 'circulo_medico',
      obra_social: obraSocial || 'OSEP',
      firma_paciente: false,
      firma_sello_medico: false,
      codigo_practica: principal?.codigo ?? undefined,
      nombre_practica: principal?.detalle ?? undefined,
      honorario_calculado: Number(principal?.total ?? 0),
      nivel: 2,
      cirugia_adicional: adicional?.detalle ?? undefined,
      cirugia_adicional_codigo: adicional?.codigo ?? undefined,
      cirugia_adicional_honorario: adicional?.total ?? undefined,
      rol_medico: rol || undefined,
    }
    const result = await createOrden(formData)
    if (result?.error) { setError(result.error); setLoading(false) }
  }

  function valorDe(key: StepKey): { valor: string; ok: boolean } {
    switch (key) {
      case 'paciente': return { valor: paciente, ok: !!paciente }
      case 'obra_social': return { valor: obraSocial, ok: !!obraSocial }
      case 'principal': return principal
        ? { valor: `${principal.codigo} · ${principal.detalle}`, ok: true }
        : { valor: principalTexto ? `"${principalTexto}" (no encontrada)` : '', ok: false }
      case 'adicional': return adicional
        ? { valor: `${adicional.codigo} · ${adicional.detalle}`, ok: true }
        : { valor: adicionalResp ? (adicionalTexto ? `"${adicionalTexto}" (no encontrada)` : 'Sin adicional') : '', ok: adicionalResp && !adicionalTexto }
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

      {!enResumen && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted-foreground)' }}>Paso {stepIdx + 1} de {STEPS.length}</p>
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
          {error && <p className="text-sm mt-1" style={{ color: 'var(--color-error)' }}>{error}</p>}
        </div>
      )}

      {enResumen && (
        <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>Revisá la foja</h2>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Tocá el 🎤 de un campo para corregirlo hablando.</p>
          {totalHonorarios > 0 && <p className="text-sm mt-3 font-mono" style={{ color: 'var(--color-success)' }}>Honorario total: ${totalHonorarios.toLocaleString('es-AR')}</p>}
          {error && <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>{error}</p>}
        </div>
      )}

      {/* Panel de campos */}
      <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {STEPS.map((s, i) => {
          const { valor, ok } = valorDe(s.key)
          const activo = !enResumen && i === stepIdx
          const editandoEste = editando === s.key
          return (
            <div key={s.key} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
              style={{ background: activo || editandoEste ? 'var(--color-background)' : 'transparent', border: activo || editandoEste ? '1px solid var(--color-primary)' : '1px solid transparent' }}>
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
                <button type="button" onClick={() => editarCampo(s.key)} disabled={procesando || (escuchando && !editandoEste)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 disabled:opacity-40"
                  style={{ background: editandoEste ? 'var(--color-error)' : 'var(--color-background)', border: '1px solid var(--color-border)', color: editandoEste ? '#fff' : 'var(--color-foreground)' }}>
                  {editandoEste ? <MicOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editandoEste ? 'Grabando' : 'Editar'}
                </button>
              )}
            </div>
          )
        })}
      </div>

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
