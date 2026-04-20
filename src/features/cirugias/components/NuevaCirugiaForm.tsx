'use client'

import { useState } from 'react'
import { createCirugia } from '@/actions/cirugias'
import {
  OBRAS_SOCIALES,
  TIPOS_ANESTESIA,
  AGENTES_FACTURADORES,
  AGENTE_LABELS,
  NIVELES_CIRUGIA,
  NIVEL_LABELS,
  type CirugiaFormData,
  type PracticaAdicional,
  type NivelCirugia,
  type AgenteFacturador,
} from '../types/cirugias'
import type { Prestacion } from '@/features/ordenes/types/ordenes'
import { PracticaAutocomplete } from '@/features/ordenes/components/PracticaAutocomplete'
import { CollapsibleSection } from './CollapsibleSection'
import { PracticasAdicionalesField } from './PracticasAdicionalesField'

export function NuevaCirugiaForm() {
  const [obraSocial, setObraSocial] = useState('')
  const [nivel, setNivel] = useState<NivelCirugia>(2)
  const [agenteFacturador, setAgenteFacturador] = useState<AgenteFacturador>('circulo_medico')
  const [prestacion, setPrestacion] = useState<Prestacion | null>(null)
  const [practicasAdicionales, setPracticasAdicionales] = useState<PracticaAdicional[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  function handlePrestacionSelect(p: Prestacion) {
    setPrestacion(p)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)

    const honorarios = prestacion?.honorarios ? Number(prestacion.honorarios) : 0
    const gastos = prestacion?.gastos ? Number(prestacion.gastos) : 0
    const total = prestacion?.total ? Number(prestacion.total) : 0

    const formData: CirugiaFormData = {
      nombre_paciente: form.get('nombre_paciente') as string,
      fecha: form.get('fecha') as string,
      obra_social: obraSocial,
      codigo_practica: prestacion?.codigo ?? (form.get('codigo_practica') as string) ?? '',
      nombre_practica: prestacion?.detalle ?? undefined,
      honorarios,
      gastos,
      total,
      observaciones: (form.get('observaciones') as string) || undefined,
      ayudante: (form.get('ayudante') as string) || undefined,
      anestesiologo: (form.get('anestesiologo') as string) || undefined,
      instrumentador: (form.get('instrumentador') as string) || undefined,
      tipo_anestesia: (form.get('tipo_anestesia') as string) || undefined,
      duracion_minutos: form.get('duracion_minutos') ? Number(form.get('duracion_minutos')) : undefined,
      institucion: (form.get('institucion') as string) || undefined,
      sala: (form.get('sala') as string) || undefined,
      practicas_adicionales: practicasAdicionales,
      nivel,
      agente_facturador: agenteFacturador,
      fecha_alta_paciente: (form.get('fecha_alta_paciente') as string) || undefined,
    }

    const result = await createCirugia(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  const practicaPrincipalTotal = prestacion?.total ? Number(prestacion.total) : 0

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Error */}
      {error && (
        <div
          className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          style={{ border: '1px solid var(--color-error)' }}
        >
          {error}
        </div>
      )}

      {/* === NIVEL + AGENTE FACTURADOR === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
            Nivel *
          </label>
          <select
            value={nivel}
            onChange={(e) => setNivel(Number(e.target.value) as NivelCirugia)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-foreground)',
            }}
          >
            {NIVELES_CIRUGIA.map((n) => (
              <option key={n} value={n}>{NIVEL_LABELS[n]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
            Agente facturador *
          </label>
          <select
            value={agenteFacturador}
            onChange={(e) => setAgenteFacturador(e.target.value as AgenteFacturador)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-foreground)',
            }}
          >
            {AGENTES_FACTURADORES.map((a) => (
              <option key={a} value={a}>{AGENTE_LABELS[a]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* === CAMPOS BASICOS (siempre visibles) === */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Paciente *
            </label>
            <input
              name="nombre_paciente"
              type="text"
              required
              placeholder="Nombre del paciente"
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Fecha *
            </label>
            <input
              name="fecha"
              type="date"
              required
              defaultValue={today}
              max={today}
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
        </div>

        {/* Obra Social */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
            Obra Social *
          </label>
          <select
            value={obraSocial}
            onChange={(e) => setObraSocial(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-foreground)',
            }}
          >
            <option value="">Seleccionar...</option>
            {OBRAS_SOCIALES.map((os) => (
              <option key={os} value={os}>{os}</option>
            ))}
          </select>
        </div>

        {/* Practica principal */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
            Practica principal *
          </label>
          <PracticaAutocomplete
            obraSocial={obraSocial || 'OSEP'}
            onSelect={handlePrestacionSelect}
          />
        </div>

        {/* Montos de practica principal */}
        {prestacion && (
          <div
            className="p-3 rounded-lg"
            style={{ background: 'var(--color-background)', border: '1px solid var(--color-success)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Practica seleccionada</p>
                <p className="text-sm font-mono" style={{ color: 'var(--color-foreground)' }}>
                  {prestacion.codigo} - {prestacion.detalle}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Total</p>
                <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-success)' }}>
                  ${Number(prestacion.total ?? 0).toLocaleString('es-AR')}
                </p>
              </div>
            </div>
            <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
              <span>Hon: ${Number(prestacion.honorarios ?? 0).toLocaleString('es-AR')}</span>
              <span>Gastos: ${Number(prestacion.gastos ?? 0).toLocaleString('es-AR')}</span>
            </div>
          </div>
        )}
      </div>

      {/* === SECCIONES COLAPSABLES === */}

      {/* Equipo Quirurgico */}
      <CollapsibleSection
        title="Equipo Quirurgico"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Ayudante
            </label>
            <input
              name="ayudante"
              type="text"
              placeholder="Dr. ..."
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Anestesiologo
            </label>
            <input
              name="anestesiologo"
              type="text"
              placeholder="Dr. ..."
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Instrumentador
            </label>
            <input
              name="instrumentador"
              type="text"
              placeholder="Nombre..."
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Anestesia y Lugar */}
      <CollapsibleSection
        title="Anestesia y Lugar"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Tipo de anestesia
            </label>
            <select
              name="tipo_anestesia"
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            >
              <option value="">Seleccionar...</option>
              {TIPOS_ANESTESIA.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Duracion (minutos)
            </label>
            <input
              name="duracion_minutos"
              type="number"
              min="0"
              placeholder="60"
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Institución {nivel === 2 && '*'}
            </label>
            <input
              name="institucion"
              type="text"
              required={nivel === 2}
              placeholder="Ej: Sanatorio Pasteur, Nosocomio de la Comunidad"
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Sala
            </label>
            <input
              name="sala"
              type="text"
              placeholder="Ej: Quirofano 2"
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Fecha de alta del paciente
            </label>
            <input
              name="fecha_alta_paciente"
              type="date"
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-foreground-muted)' }}>
              Solo si quedó internado. Si se fue el mismo día de la cirugía, dejá vacío.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Practicas Adicionales */}
      <CollapsibleSection
        title="Practicas Adicionales"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        }
      >
        <PracticasAdicionalesField
          obraSocial={obraSocial || 'OSEP'}
          value={practicasAdicionales}
          onChange={setPracticasAdicionales}
          practicaPrincipalTotal={practicaPrincipalTotal}
        />
      </CollapsibleSection>

      {/* === CAMPOS FINALES (siempre visibles) === */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
          Observaciones
        </label>
        <textarea
          name="observaciones"
          rows={3}
          placeholder="Notas adicionales (opcional)"
          className="w-full px-4 py-3 rounded-lg text-sm resize-none"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {loading ? 'Guardando...' : 'Guardar cirugia'}
        </button>
        <a
          href="/cirugias"
          className="px-4 py-3.5 rounded-lg text-sm font-medium transition-colors text-center"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        >
          Cancelar
        </a>
      </div>
    </form>
  )
}
