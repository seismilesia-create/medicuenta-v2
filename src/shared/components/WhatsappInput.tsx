'use client'

import { useState } from 'react'
import { nacionalDeWhatsappAr } from '@/lib/whatsapp/numeroAr'

/**
 * Campo del número de WhatsApp del médico con el `+54` fijo a la izquierda, para que no lo
 * omita (si el número se guarda sin el 54 el bot no reconoce al médico y lo trata como
 * paciente). El médico escribe solo el nacional (área + número); el servidor lo normaliza
 * con normalizarWhatsappAr (tolera 0 de trunk, 15 y el 9). Envía en `name="numeroWhatsapp"`.
 */
export function WhatsappInput({ defaultValue = '', required }: { defaultValue?: string; required?: boolean }) {
  const [nac, setNac] = useState(() => nacionalDeWhatsappAr(defaultValue))
  return (
    <div>
      <div className="flex w-full items-stretch overflow-hidden rounded-xl border border-border">
        <span className="flex select-none items-center border-r border-border bg-[var(--color-muted)] px-3 text-sm text-[var(--color-muted-foreground)]">
          +54
        </span>
        <input
          name="numeroWhatsapp"
          type="tel"
          inputMode="numeric"
          required={required}
          value={nac}
          onChange={(e) => setNac(e.target.value.replace(/[^\d\s]/g, ''))}
          placeholder="383 4222049"
          aria-label="Número de WhatsApp: código de área y número, sin 0 ni 15"
          className="flex-1 bg-transparent px-3 py-2 outline-none"
        />
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
        Tu celular con código de área, sin el 0 ni el 15. Ej: 383 4222049
      </p>
    </div>
  )
}
