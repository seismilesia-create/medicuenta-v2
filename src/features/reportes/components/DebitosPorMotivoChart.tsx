'use client'

import { PieChart as PieIcon } from 'lucide-react'
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
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 h-full">
      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
            <PieIcon className="h-5 w-5 text-red-500" strokeWidth={1.5} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Débitos por motivo</h3>
        </div>

        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data} dataKey="monto" nameKey="motivo" cx="50%" cy="50%" outerRadius={100} labelLine={false}>
                {data.map((entry) => (
                  <Cell key={entry.motivo} fill={MOTIVO_COLORS[entry.motivo]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [ARS.format(Number(value ?? 0)), MOTIVO_LABELS[name as MotivoDebito] ?? String(name)]}
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
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
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Sin débitos en este periodo.
          </div>
        )}
      </div>
    </div>
  )
}
