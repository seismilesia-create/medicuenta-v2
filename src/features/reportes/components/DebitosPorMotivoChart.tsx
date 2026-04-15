'use client'

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import type { DebitosPorMotivoPoint } from '../types/reportes'
import { MOTIVO_LABELS, type MotivoDebito } from '@/features/debitos/types/debitos'
import { ARS } from '../lib/format'

interface Props {
  data: DebitosPorMotivoPoint[]
}

const MOTIVO_COLORS: Record<MotivoDebito, string> = {
  falta_token: '#ef4444',
  falta_firma: '#f97316',
  falta_diagnostico: '#eab308',
  no_autorizada: '#8b5cf6',
  error_codigo: '#3b82f6',
  otro: '#6b7280',
}

export function DebitosPorMotivoChart({ data }: Props) {
  return (
    <div className="rounded-xl p-5 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
        Débitos por motivo
      </h3>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey="monto"
              nameKey="motivo"
              cx="50%"
              cy="50%"
              outerRadius={100}
              labelLine={false}
            >
              {data.map((entry) => (
                <Cell key={entry.motivo} fill={MOTIVO_COLORS[entry.motivo]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [ARS.format(Number(value ?? 0)), MOTIVO_LABELS[name as MotivoDebito] ?? String(name)]}
              contentStyle={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => MOTIVO_LABELS[value as MotivoDebito] ?? String(value)}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-sm" style={{ color: 'var(--color-foreground-muted)' }}>
          Sin débitos en este período.
        </div>
      )}
    </div>
  )
}
