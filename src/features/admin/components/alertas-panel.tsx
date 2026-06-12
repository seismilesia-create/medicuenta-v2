import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react'
import type { Alerta, Severidad } from '@/lib/admin/alertas'

const ESTILO: Record<Severidad, { icon: typeof Info; color: string; bg: string; border: string }> = {
  error: { icon: AlertCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.3)' },
  warning: { icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.3)' },
  info: { icon: Info, color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.25)' },
}

/**
 * Lo que detectó el orquestador (spec §6). v1: observa y muestra. La entrega
 * proactiva por WhatsApp/email es el paso siguiente (v1b).
 */
export function AlertasPanel({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm"
        style={{ background: 'rgba(34,197,94,0.06)' }}
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span className="text-[var(--color-foreground)]">El orquestador no detectó problemas. Todo en orden. 👌</span>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {alertas.map((a, i) => {
        const st = ESTILO[a.severidad]
        const Icon = st.icon
        return (
          <li
            key={i}
            className="flex items-start gap-3 rounded-xl border px-4 py-2.5 text-sm"
            style={{ background: st.bg, borderColor: st.border }}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: st.color }} />
            <div className="flex-1">
              <span className="font-medium">{a.medico}</span>
              <span className="text-[var(--color-muted-foreground)]"> — {a.mensaje}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
