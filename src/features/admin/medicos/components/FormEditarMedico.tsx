// src/features/admin/medicos/components/FormEditarMedico.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarMedico } from '@/actions/admin-medicos'
import type { MedicoDetalle } from '@/features/admin/medicos/types'

export function FormEditarMedico({ medicoId, inicial }: { medicoId: string; inicial: MedicoDetalle }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null); setOk(false); setLoading(true)
    const form = new FormData(e.currentTarget)
    const r = await actualizarMedico(medicoId, {
      nombre: String(form.get('nombre') ?? ''),
      apellido: String(form.get('apellido') ?? ''),
      especialidad: String(form.get('especialidad') ?? ''),
      matricula: String(form.get('matricula') ?? ''),
      cuit: String(form.get('cuit') ?? ''),
      telefono: String(form.get('telefono') ?? ''),
      numeroWhatsapp: String(form.get('numeroWhatsapp') ?? ''),
      categoria_arancel: ((form.get('categoria_arancel') as string) || undefined) as 'comun' | 'especialista' | 'oftalmologica' | undefined,
      recertificado: form.get('recertificado') === 'on',
      atiende_interior: form.get('atiende_interior') === 'on',
    })
    setLoading(false)
    if ('error' in r) { setError(r.error); return }
    setOk(true)
    router.refresh()
  }

  const input = 'w-full rounded-xl border border-border px-3 py-2'
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {inicial.slug && (
        <p className="text-sm text-[var(--color-muted-foreground)]">Link público: /c/{inicial.slug} (no se edita acá)</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <input name="nombre" required defaultValue={inicial.nombre} placeholder="Nombre" className={input} />
        <input name="apellido" required defaultValue={inicial.apellido} placeholder="Apellido" className={input} />
      </div>
      <input name="especialidad" defaultValue={inicial.especialidad} placeholder="Especialidad" className={input} />
      <select name="categoria_arancel" defaultValue={inicial.categoria_arancel} className={input}>
        <option value="">Categoría arancelaria (definir luego)</option>
        <option value="comun">Consulta común (médica)</option>
        <option value="especialista">Especialista</option>
        <option value="oftalmologica">Oftalmológica</option>
      </select>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="recertificado" defaultChecked={inicial.recertificado} /> Recertificado</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="atiende_interior" defaultChecked={inicial.atiende_interior} /> Atiende en el interior</label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input name="matricula" defaultValue={inicial.matricula} placeholder="Matrícula" className={input} />
        <input name="cuit" defaultValue={inicial.cuit} placeholder="CUIT" className={input} />
      </div>
      <input name="telefono" defaultValue={inicial.telefono} placeholder="Teléfono" className={input} />
      <input name="numeroWhatsapp" required defaultValue={inicial.numeroWhatsapp} placeholder="Número de WhatsApp" className={input} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {ok && <p className="text-sm text-primary">✓ Cambios guardados.</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
          {loading ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <a href="/admin/medicos" className="rounded-xl border border-border px-4 py-2">Volver</a>
      </div>
    </form>
  )
}
