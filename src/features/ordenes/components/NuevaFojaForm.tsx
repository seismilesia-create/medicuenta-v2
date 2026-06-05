'use client'

import { useState } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { createOrden } from '@/actions/ordenes'
import { useVoiceInput } from '@/features/assistant/hooks/useVoiceInput'
import {
  OBRAS_SOCIALES,
  ROLES_MEDICO,
  ROL_MEDICO_LABELS,
  type Prestacion,
  type OrdenFormData,
  type RolMedico,
} from '../types/ordenes'
import { PracticaAutocomplete } from './PracticaAutocomplete'

const inputBase = 'w-full px-4 py-3 rounded-lg text-sm'
const inputStyle = {
  background: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-foreground)',
} as const

interface FojaParse {
  nombre: string
  apellido: string
  obra_social: string
  rol_medico: RolMedico | ''
  principal: { codigo: string; detalle: string; total: number | null } | null
  adicional: { codigo: string; detalle: string; total: number | null } | null
}

function asPrestacion(m: { codigo: string; detalle: string; total: number | null }, os: string): Prestacion {
  return { id: 0, codigo: m.codigo, detalle: m.detalle, honorarios: null, gastos: null, total: m.total, seccion: '', categoria: null, obra_social: os }
}

export function NuevaFojaForm() {
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [obraSocial, setObraSocial] = useState('')
  const [rolMedico, setRolMedico] = useState<RolMedico | ''>('')
  const [principal, setPrincipal] = useState<Prestacion | null>(null)
  const [adicional, setAdicional] = useState<Prestacion | null>(null)
  const [autoKey, setAutoKey] = useState(0) // re-monta los autocompletes al dictar

  const [parsing, setParsing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDictado(transcript: string) {
    setParsing(true)
    setError(null)
    try {
      const res = await fetch('/api/parse-foja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Error procesando el dictado' }))
        throw new Error(e.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as FojaParse
      if (data.nombre) setNombre(data.nombre)
      if (data.apellido) setApellido(data.apellido)
      const os = matchOs(data.obra_social)
      if (os) setObraSocial(os)
      if (data.rol_medico) setRolMedico(data.rol_medico)
      setPrincipal(data.principal ? asPrestacion(data.principal, os || 'OSEP') : null)
      setAdicional(data.adicional ? asPrestacion(data.adicional, os || 'OSEP') : null)
      setAutoKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando el dictado')
    } finally {
      setParsing(false)
    }
  }

  const voice = useVoiceInput({ onFinalTranscript: handleDictado })

  function toggleVoz() {
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  const totalHonorarios = (Number(principal?.total ?? 0) + Number(adicional?.total ?? 0))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim() && !apellido.trim()) {
      setError('Indicá al menos el paciente.')
      return
    }
    setLoading(true)

    const nombrePaciente = [apellido.trim(), nombre.trim()].filter(Boolean).join(', ')

    const formData: OrdenFormData = {
      tipo: 'obra_social',
      nombre_paciente: nombrePaciente,
      fecha_atencion: new Date().toISOString().split('T')[0],
      monto_plus: 0,
      agente_facturador: 'circulo_medico',
      obra_social: obraSocial || 'OSEP',
      firma_paciente: false,
      codigo_practica: principal?.codigo ?? undefined,
      nombre_practica: principal?.detalle ?? undefined,
      honorario_calculado: Number(principal?.total ?? 0),
      // Nivel 2 (foja)
      nivel: 2,
      cirugia_adicional: adicional?.detalle ?? undefined,
      cirugia_adicional_codigo: adicional?.codigo ?? undefined,
      cirugia_adicional_honorario: adicional?.total ?? undefined,
      rol_medico: rolMedico || undefined,
    }

    const result = await createOrden(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // success → redirect a /ordenes
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Dictado por voz */}
      <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>Dictá la foja de corrido</p>
        <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: 'var(--color-muted-foreground)' }}>
          Ej: &quot;Juan Pérez, OSEP, colecistectomía como principal, hernia inguinal como adicional, fui cirujano principal&quot;. Después revisás y guardás.
        </p>
        <button
          type="button"
          onClick={toggleVoz}
          disabled={!voice.isSupported || parsing}
          className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: voice.isListening ? 'var(--color-error)' : 'var(--color-primary)' }}
        >
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : voice.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {parsing ? 'Procesando...' : voice.isListening ? 'Detener' : 'Dictar foja'}
        </button>
        <div className="h-5 mt-2 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          {voice.isListening && (voice.interimTranscript || 'Te escucho...')}
          {!voice.isSupported && 'Tu navegador no soporta voz — completá a mano.'}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" style={{ border: '1px solid var(--color-error)' }}>
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan" className={inputBase} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Apellido</label>
            <input value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Pérez" className={inputBase} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Obra Social *</label>
            <select value={obraSocial} onChange={(e) => setObraSocial(e.target.value)} required className={inputBase} style={inputStyle}>
              <option value="">Seleccionar...</option>
              {OBRAS_SOCIALES.map((os) => (<option key={os} value={os}>{os}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Rol del médico</label>
            <select value={rolMedico} onChange={(e) => setRolMedico(e.target.value as RolMedico | '')} className={inputBase} style={inputStyle}>
              <option value="">Seleccionar...</option>
              {ROLES_MEDICO.map((r) => (<option key={r} value={r}>{ROL_MEDICO_LABELS[r]}</option>))}
            </select>
          </div>
        </div>

        <div key={autoKey} className="space-y-4">
          <div>
            <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-primary)' }}>Cirugía principal</p>
            <PracticaAutocomplete
              obraSocial={obraSocial || 'OSEP'}
              onSelect={setPrincipal}
              value={principal ? `${principal.codigo} - ${principal.detalle}` : ''}
            />
          </div>
          <div>
            <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-primary)' }}>Cirugía adicional</p>
            <PracticaAutocomplete
              obraSocial={obraSocial || 'OSEP'}
              onSelect={setAdicional}
              value={adicional ? `${adicional.codigo} - ${adicional.detalle}` : ''}
            />
          </div>
        </div>

        {(principal || adicional) && (
          <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'var(--color-background)', border: '1px solid var(--color-success)' }}>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Honorario total (principal + adicional)</span>
            <span className="text-xl font-bold font-mono" style={{ color: 'var(--color-success)' }}>
              ${totalHonorarios.toLocaleString('es-AR')}
            </span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
            {loading ? 'Guardando...' : 'Guardar foja'}
          </button>
          <a href="/ordenes" className="px-4 py-3.5 rounded-lg text-sm font-medium transition-colors text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}>
            Cancelar
          </a>
        </div>
      </form>
    </div>
  )
}

function matchOs(scanned: string): string {
  if (!scanned) return ''
  const low = scanned.toLowerCase()
  for (const os of OBRAS_SOCIALES) {
    if (os.toLowerCase() === low || low.includes(os.toLowerCase()) || os.toLowerCase().includes(low)) return os
  }
  return ''
}
