'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export interface TrendDataPoint {
  month: string
  facturado: number
  cobrado: number
  debitado: number
}

interface Props {
  data: TrendDataPoint[]
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

// Fixed colors that work in both light and dark mode
const COLORS = {
  facturado: '#0A84FF',
  cobrado: '#30D158',
  debitado: '#FF453A',
}

export function DashboardTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl p-5 md:p-7" style={{ backgroundColor: 'var(--color-surface)' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
          Tendencia ultimos 6 meses
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No hay datos suficientes para mostrar la tendencia. Carga ordenes para ver el grafico.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-5 md:p-7" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
        Tendencia ultimos 6 meses
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: 'var(--color-muted)' }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
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
          <Bar dataKey="facturado" name="Facturado" fill={COLORS.facturado} radius={[4, 4, 0, 0]} />
          <Bar dataKey="cobrado" name="Cobrado" fill={COLORS.cobrado} radius={[4, 4, 0, 0]} />
          <Bar dataKey="debitado" name="Debitado" fill={COLORS.debitado} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
