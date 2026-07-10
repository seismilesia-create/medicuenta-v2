'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { altaMedicoSchema } from '@/features/onboarding/types'
import { completarInvitacionMedico } from '@/actions/onboarding-medico'

export function FormAltaMedico({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [mostrarPasswordConfirm, setMostrarPasswordConfirm] = useState(false)
  const input = 'w-full rounded-xl border border-border px-3 py-2'

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const raw = {
      nombre: String(form.get('nombre') ?? ''),
      apellido: String(form.get('apellido') ?? ''),
      especialidad: String(form.get('especialidad') ?? ''),
      matricula: String(form.get('matricula') ?? ''),
      cuit: String(form.get('cuit') ?? ''),
      telefono: String(form.get('telefono') ?? ''),
      email: String(form.get('email') ?? ''),
      numeroWhatsapp: String(form.get('numeroWhatsapp') ?? ''),
      password: String(form.get('password') ?? ''),
      passwordConfirm: String(form.get('passwordConfirm') ?? ''),
    }
    // Validación en cliente para feedback inmediato; la autoridad es el servidor.
    const parsed = altaMedicoSchema.safeParse(raw)
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }

    setLoading(true)
    const r = await completarInvitacionMedico(token, parsed.data)
    // Si hay éxito, la action hace redirect y no retorna. Solo llegamos acá con error.
    setLoading(false)
    if (r && 'error' in r) setError(r.error)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <input name="nombre" required placeholder="Nombre" className={input} />
        <input name="apellido" required placeholder="Apellido" className={input} />
      </div>
      <input name="especialidad" placeholder="Especialidad" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <input name="matricula" placeholder="Matrícula" className={input} />
        <input name="cuit" placeholder="CUIT" className={input} />
      </div>
      <input name="telefono" placeholder="Teléfono" className={input} />
      <input name="numeroWhatsapp" required placeholder="Número de WhatsApp (ej: +54 9 383 …)" className={input} />
      <input name="email" type="email" required placeholder="Email" className={input} />
      <div className="relative">
        <input
          name="password"
          type={mostrarPassword ? 'text' : 'password'}
          required
          placeholder="Contraseña (mín. 8, con letras y números)"
          className={`${input} pr-10`}
        />
        <button
          type="button"
          onClick={() => setMostrarPassword((v) => !v)}
          aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-r-xl"
        >
          {mostrarPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <div className="relative">
        <input
          name="passwordConfirm"
          type={mostrarPasswordConfirm ? 'text' : 'password'}
          required
          placeholder="Repetí la contraseña"
          className={`${input} pr-10`}
        />
        <button
          type="button"
          onClick={() => setMostrarPasswordConfirm((v) => !v)}
          aria-label={mostrarPasswordConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-r-xl"
        >
          {mostrarPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
        {loading ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
      </button>
    </form>
  )
}
