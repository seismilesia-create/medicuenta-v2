'use client'

import { useState } from 'react'
import { createOrden } from '@/actions/ordenes'
import { OBRAS_SOCIALES, type TipoAtencion, type Prestacion, type OrdenFormData } from '../types/ordenes'
import { PracticaAutocomplete } from './PracticaAutocomplete'

export function NuevaOrdenForm() {
  const [tipo, setTipo] = useState<TipoAtencion>('obra_social')
  const [obraSocial, setObraSocial] = useState('')
  const [prestacionSeleccionada, setPrestacionSeleccionada] = useState<Prestacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handlePrestacionSelect(prestacion: Prestacion) {
    setPrestacionSeleccionada(prestacion)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)

    const formData: OrdenFormData = tipo === 'obra_social'
      ? {
          tipo: 'obra_social',
          nombre_paciente: form.get('nombre_paciente') as string,
          fecha_atencion: form.get('fecha_atencion') as string,
          observaciones: (form.get('observaciones') as string) || undefined,
          monto_plus: Number(form.get('monto_plus') || 0),
          obra_social: obraSocial,
          nro_afiliado: form.get('nro_afiliado') as string,
          token_osep: (form.get('token_osep') as string) || undefined,
          firma_paciente: form.get('firma_paciente') === 'on',
          codigo_practica: prestacionSeleccionada?.codigo ?? (form.get('codigo_practica') as string),
          nombre_practica: prestacionSeleccionada?.detalle ?? undefined,
          diagnostico_cie10: (form.get('diagnostico_cie10') as string) || undefined,
          honorario_calculado: prestacionSeleccionada?.total
            ? Number(prestacionSeleccionada.total)
            : Number(form.get('honorario_calculado') || 0),
        }
      : {
          tipo: 'particular',
          nombre_paciente: form.get('nombre_paciente') as string,
          fecha_atencion: form.get('fecha_atencion') as string,
          observaciones: (form.get('observaciones') as string) || undefined,
          monto_plus: Number(form.get('monto_plus') || 0),
          nombre_practica: form.get('nombre_practica') as string,
          monto_particular: Number(form.get('monto_particular') || 0),
        }

    const result = await createOrden(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // If success, createOrden redirects to /ordenes
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {/* Error message */}
      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" style={{ border: '1px solid var(--color-error)' }}>
          {error}
        </div>
      )}

      {/* Tipo de atencion */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>
          Tipo de atencion
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setTipo('obra_social')}
            className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
            style={tipo === 'obra_social' ? {
              background: 'var(--color-primary)',
              color: 'white',
              boxShadow: '0 0 0 2px var(--color-primary)',
            } : {
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-muted)',
            }}
          >
            Obra Social
          </button>
          <button
            type="button"
            onClick={() => setTipo('particular')}
            className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
            style={tipo === 'particular' ? {
              background: 'var(--color-secondary)',
              color: 'white',
              boxShadow: '0 0 0 2px var(--color-secondary)',
            } : {
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-muted)',
            }}
          >
            Particular
          </button>
        </div>
      </div>

      {/* Datos del paciente */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
            Nombre del paciente *
          </label>
          <input
            name="nombre_paciente"
            type="text"
            required
            placeholder="Juan Perez"
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
            Fecha de atencion *
          </label>
          <input
            name="fecha_atencion"
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

      {/* Campos Obra Social */}
      {tipo === 'obra_social' && (
        <div className="space-y-4 p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
            Datos de Obra Social
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
                Nro. Afiliado *
              </label>
              <input
                name="nro_afiliado"
                type="text"
                required
                placeholder="000000"
                className="w-full px-4 py-3 rounded-lg text-sm"
                style={{
                  background: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                }}
              />
            </div>
          </div>

          {/* OSEP specific fields */}
          {obraSocial === 'OSEP' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
                  Token OSEP (6 digitos) *
                </label>
                <input
                  name="token_osep"
                  type="text"
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="123456"
                  className="w-full px-4 py-3 rounded-lg text-sm font-mono"
                  style={{
                    background: 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                  }}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    name="firma_paciente"
                    type="checkbox"
                    className="w-4 h-4 rounded"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>
                    Firma del paciente
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Practica autocomplete */}
          <PracticaAutocomplete
            obraSocial={obraSocial || 'OSEP'}
            onSelect={handlePrestacionSelect}
          />

          {/* Diagnostico */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Diagnostico CIE-10
            </label>
            <input
              name="diagnostico_cie10"
              type="text"
              placeholder="Codigo CIE-10 (opcional)"
              className="w-full px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>

          {/* Honorario calculado */}
          {prestacionSeleccionada && (
            <div className="p-3 rounded-lg" style={{ background: 'var(--color-background)', border: '1px solid var(--color-success)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Honorario calculado</p>
                  <p className="text-sm font-mono" style={{ color: 'var(--color-foreground)' }}>
                    {prestacionSeleccionada.codigo} - {prestacionSeleccionada.detalle}
                  </p>
                </div>
                <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-success)' }}>
                  ${Number(prestacionSeleccionada.total ?? 0).toLocaleString('es-AR')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Campos Particular */}
      {tipo === 'particular' && (
        <div className="space-y-4 p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-secondary)' }}>
            Prestacion Particular
          </h3>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Descripcion de la prestacion *
            </label>
            <input
              name="nombre_practica"
              type="text"
              required
              placeholder="Consulta, cirugia menor, etc."
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
              Monto cobrado *
            </label>
            <input
              name="monto_particular"
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-lg text-sm font-mono"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
        </div>
      )}

      {/* Plus (solo para Obra Social) */}
      {tipo === 'obra_social' && (
      <div className="p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-warning)' }}>
            <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>
            Plus (privado)
          </h3>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
          Este dato es estrictamente privado. Solo vos podes verlo.
        </p>
        <input
          name="monto_plus"
          type="number"
          min="0"
          step="0.01"
          defaultValue="0"
          placeholder="0.00"
          className="w-full px-4 py-3 rounded-lg text-sm font-mono"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
      </div>
      )}

      {/* Observaciones */}
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
          {loading ? 'Guardando...' : 'Guardar orden'}
        </button>
        <a
          href="/ordenes"
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
