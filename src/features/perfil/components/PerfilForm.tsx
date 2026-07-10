'use client'

import { useState } from 'react'
import { updatePerfil } from '@/actions/perfil'
import { OBRAS_SOCIALES, type Perfil, type PerfilFormData } from '../types/perfil'

interface Props {
  perfil: Perfil
  email: string | null
}

export function PerfilForm({ perfil, email }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedOS, setSelectedOS] = useState<string[]>(perfil.obras_sociales ?? [])

  function toggleOS(os: string) {
    setSelectedOS(prev =>
      prev.includes(os) ? prev.filter(o => o !== os) : [...prev, os]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    const form = new FormData(e.currentTarget)

    const formData: PerfilFormData = {
      nombre: form.get('nombre') as string,
      apellido: form.get('apellido') as string,
      matricula: (form.get('matricula') as string) || undefined,
      cuit: (form.get('cuit') as string) || undefined,
      telefono: (form.get('telefono') as string) || undefined,
      especialidad: (form.get('especialidad') as string) || undefined,
      obras_sociales: selectedOS,
    }

    const result = await updatePerfil(formData)

    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }

    setLoading(false)
  }

  const inputClasses = "w-full px-4 py-3 rounded-lg text-sm transition-colors outline-none"

  return (
    <form onSubmit={handleSubmit} className="space-y-6 md:space-y-10 max-w-2xl">
      {/* Feedback */}
      {error && (
        <div className="p-4 rounded-lg text-sm" style={{
          background: 'var(--color-error-light)',
          color: 'var(--color-error)',
        }}>
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg text-sm" style={{
          background: 'var(--color-success-light)',
          color: 'var(--color-success)',
        }}>
          Perfil actualizado correctamente
        </div>
      )}

      {/* Datos personales */}
      <section className="rounded-xl p-4 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
        <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--color-foreground)' }}>
          Datos personales
        </h2>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground-secondary)' }}>
                Nombre
              </label>
              <input
                name="nombre"
                type="text"
                defaultValue={perfil.nombre ?? ''}
                className={inputClasses}
                style={{
                  backgroundColor: 'var(--color-surface-elevated)',
                  color: 'var(--color-foreground)',
                }}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground-secondary)' }}>
                Apellido
              </label>
              <input
                name="apellido"
                type="text"
                defaultValue={perfil.apellido ?? ''}
                className={inputClasses}
                style={{
                  backgroundColor: 'var(--color-surface-elevated)',
                  color: 'var(--color-foreground)',
                }}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              value={email ?? ''}
              className={`${inputClasses} opacity-60 cursor-not-allowed`}
              style={{
                backgroundColor: 'var(--color-surface-elevated)',
                color: 'var(--color-foreground-muted)',
              }}
              readOnly
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-foreground-muted)' }}>
              El email no se puede modificar
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground-secondary)' }}>
                Matricula
              </label>
              <input
                name="matricula"
                type="text"
                defaultValue={perfil.matricula ?? ''}
                placeholder="Ej: 12345"
                className={inputClasses}
                style={{
                  backgroundColor: 'var(--color-surface-elevated)',
                  color: 'var(--color-foreground)',
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground-secondary)' }}>
                CUIT
              </label>
              <input
                name="cuit"
                type="text"
                defaultValue={perfil.cuit ?? ''}
                placeholder="Ej: 20-12345678-9"
                className={inputClasses}
                style={{
                  backgroundColor: 'var(--color-surface-elevated)',
                  color: 'var(--color-foreground)',
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground-secondary)' }}>
              Telefono
            </label>
            <input
              name="telefono"
              type="tel"
              defaultValue={perfil.telefono ?? ''}
              placeholder="Ej: 3834-123456"
              className={inputClasses}
              style={{
                backgroundColor: 'var(--color-surface-elevated)',
                color: 'var(--color-foreground)',
              }}
            />
          </div>
        </div>
      </section>

      {/* Especialidad */}
      <section className="rounded-xl p-4 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
        <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--color-foreground)' }}>
          Especialidad
        </h2>
        <div>
          <input
            name="especialidad"
            type="text"
            defaultValue={perfil.especialidad ?? ''}
            placeholder="Ej: Clinica Medica, Cardiologia, Pediatria..."
            className={inputClasses}
            style={{
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-foreground)',
            }}
          />
        </div>
      </section>

      {/* Obras Sociales */}
      <section className="rounded-xl p-4 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-foreground)' }}>
          Obras sociales habilitadas
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-foreground-muted)' }}>
          Selecciona las obras sociales con las que trabajas
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {OBRAS_SOCIALES.map((os) => {
            const isSelected = selectedOS.includes(os)
            return (
              <button
                key={os}
                type="button"
                onClick={() => toggleOS(os)}
                className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-left"
                style={{
                  backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface-elevated)',
                  color: isSelected ? '#FFFFFF' : 'var(--color-foreground)',
                }}
              >
                <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{
                  border: isSelected ? 'none' : '2px solid var(--color-foreground-muted)',
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : 'transparent',
                }}>
                  {isSelected && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {os}
              </button>
            )
          })}
        </div>
      </section>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: '#FFFFFF',
        }}
      >
        {loading ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  )
}
