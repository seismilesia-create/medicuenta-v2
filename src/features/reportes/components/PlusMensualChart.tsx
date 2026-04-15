'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { PlusMensualPoint } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: PlusMensualPoint[]
}

export function PlusMensualChart({ data }: Props) {
  const hasData = data.some(d => d.monto > 0)

  return (
    <div className="rounded-xl p-5 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-base font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Plus cobrado por mes
        </h3>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}
        >
          🔒 Privado
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-foreground-muted)' }}>
        Últimos 6 meses — dato confidencial, solo visible para vos.
      </p>
      {hasData ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatARSCompact(Number(v))}
              tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => [ARS.format(Number(value ?? 0)), 'Plus']}
              contentStyle={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Bar dataKey="monto" fill="var(--color-warning)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-sm" style={{ color: 'var(--color-foreground-muted)' }}>
          Sin plus registrado en los últimos 6 meses.
        </div>
      )}
    </div>
  )
}
