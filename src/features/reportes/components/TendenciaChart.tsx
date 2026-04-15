'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { TendenciaPoint } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: TendenciaPoint[]
}

const COLORS = {
  facturado: 'var(--color-info)',
  cobrado: 'var(--color-success)',
  debitos: 'var(--color-error)',
}

export function TendenciaChart({ data }: Props) {
  const hasData = data.some(d => d.facturado > 0 || d.cobrado > 0 || d.debitos > 0)

  return (
    <ChartShell title="Tendencia mensual (últimos 6 meses)">
      {hasData ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatARSCompact(Number(v))}
              tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value, name) => [ARS.format(Number(value ?? 0)), String(name ?? '').charAt(0).toUpperCase() + String(name ?? '').slice(1)]}
              contentStyle={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="facturado" name="Facturado" stroke={COLORS.facturado} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="cobrado" name="Cobrado" stroke={COLORS.cobrado} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="debitos" name="Débitos" stroke={COLORS.debitos} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState />
      )}
    </ChartShell>
  )
}

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-[300px] flex items-center justify-center text-sm" style={{ color: 'var(--color-foreground-muted)' }}>
      No hay datos para mostrar en este período.
    </div>
  )
}
