// src/features/admin/medicos/components/FormNuevoMedico.tsx
'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { onboardMedico, chequearSlugDisponible } from '@/actions/admin-medicos'
import { generarSlugBase } from '@/features/admin/medicos/slug'
import type { OnboardMedicoResult } from '@/features/admin/medicos/types'

export function FormNuevoMedico() {
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTocado, setSlugTocado] = useState(false)
  const [slugLibre, setSlugLibre] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState<OnboardMedicoResult | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  // Autocompletar el slug desde nombre/apellido mientras no lo editen a mano.
  useEffect(() => {
    if (!slugTocado) setSlug(generarSlugBase(nombre, apellido))
  }, [nombre, apellido, slugTocado])

  // Check de disponibilidad en vivo (debounce simple).
  useEffect(() => {
    if (!slug) { setSlugLibre(null); return }
    const t = setTimeout(async () => {
      const r = await chequearSlugDisponible(slug)
      setSlugLibre('disponible' in r ? r.disponible : null)
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null); setLoading(true)
    const form = new FormData(e.currentTarget)
    const r = await onboardMedico({
      email: String(form.get('email') ?? ''),
      nombre, apellido,
      especialidad: String(form.get('especialidad') ?? ''),
      matricula: String(form.get('matricula') ?? ''),
      cuit: String(form.get('cuit') ?? ''),
      telefono: String(form.get('telefono') ?? ''),
      numeroWhatsapp: String(form.get('numeroWhatsapp') ?? ''),
      slug,
    })
    setLoading(false)
    if ('error' in r) { setError(r.error); return }
    setOk(r)
    setQr(await QRCode.toDataURL(r.link))
  }

  if (ok) {
    return (
      <div className="space-y-4 rounded-xl border border-border p-6">
        <p className="font-medium">Médico creado e invitado por email.</p>
        <p className="text-sm">Link público: <a href={ok.link} className="text-primary underline">{ok.link}</a></p>
        <button onClick={() => navigator.clipboard.writeText(ok.link)} className="rounded-lg border border-border px-3 py-1 text-sm">Copiar link</button>
        {qr && <img src={qr} alt="QR del link" className="w-40 h-40" />}
        <div><a href="/admin/medicos" className="text-primary underline text-sm">← Volver a la lista</a></div>
      </div>
    )
  }

  const input = 'w-full rounded-xl border border-border px-3 py-2'
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input name="email" type="email" required placeholder="Email del médico" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={input} />
        <input required placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} className={input} />
      </div>
      <input name="especialidad" placeholder="Especialidad" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <input name="matricula" placeholder="Matrícula" className={input} />
        <input name="cuit" placeholder="CUIT" className={input} />
      </div>
      <input name="telefono" placeholder="Teléfono" className={input} />
      <input name="numeroWhatsapp" required placeholder="Número de WhatsApp (ej: +54 9 383 …)" className={input} />
      <div>
        <input
          required value={slug}
          onChange={(e) => { setSlugTocado(true); setSlug(e.target.value) }}
          placeholder="slug-publico" className={input}
        />
        <p className="text-xs mt-1">
          Link: /c/{slug || '…'} {slugLibre === true && '· ✓ disponible'} {slugLibre === false && '· ✗ en uso'}
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading || slugLibre === false} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
        {loading ? 'Creando…' : 'Crear médico'}
      </button>
    </form>
  )
}
