'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { seleccionarConsultorio } from '@/actions/consultorio-seleccion'

interface Props {
  medicos: { id: string; nombre: string | null }[]
  activo: string | null
}

/** Selector de consultorio para quien opera más de uno (secretaria de varios médicos, o
 *  médico que además es secretaria). Solo se renderiza si hay 2+ (lo decide el caller). */
export function ConsultorioSelector({ medicos, activo }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="px-4">
      <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <select
          value={activo ?? ''}
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value
            startTransition(async () => {
              await seleccionarConsultorio(id)
              router.refresh()
            })
          }}
          className="w-full bg-transparent outline-none"
        >
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre ?? 'Consultorio'}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
