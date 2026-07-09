'use client'

import { useState } from 'react'
import { altaMedicoSchema } from '@/features/onboarding/types'
import { completarInvitacionMedico } from '@/actions/onboarding-medico'

export function FormAltaMedico({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
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
      <input name="password" type="password" required placeholder="Contraseña (mín. 8, con letras y números)" className={input} />
      <input name="passwordConfirm" type="password" required placeholder="Repetí la contraseña" className={input} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
        {loading ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
      </button>
    </form>
  )
}
