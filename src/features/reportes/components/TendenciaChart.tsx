'use client'

import { TrendingUp } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { TendenciaPoint } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: TendenciaPoint[]
}

const COLORS = {
  facturado: '#0ea5e9', // sky-500
  cobrado: '#3b82f6', // blue-500
  debitos: '#ef4444', // red-500
}

export function TendenciaChart({ data }: Props) {
  const hasData = data.some((d) => d.facturado > 0 || d.cobrado > 0 || d.debitos > 0)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Tendencia mensual</h3>
              <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LegendDot color={COLORS.facturado} label="Facturado" />
            <LegendDot color={COLORS.cobrado} label="Cobrado" />
            <LegendDot color={COLORS.debitos} label="Débitos" />
          </div>
        </div>

        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} strokeOpacity={0.5} />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => formatARSCompact(Number(v))}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value, name) => [ARS.format(Number(value ?? 0)), String(name ?? '').charAt(0).toUpperCase() + String(name ?? '').slice(1)]}
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
                  fontSize: '13px',
                }}
              />
              <Line type="monotone" dataKey="facturado" name="Facturado" stroke={COLORS.facturado} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="cobrado" name="Cobrado" stroke={COLORS.cobrado} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="debitos" name="Debitos" stroke={COLORS.debitos} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState />
        )}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }} />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

function EmptyChartState() {
  return (
    <div className="flex flex-col items-center justify-center h-[250px] text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
          <TrendingUp className="h-8 w-8 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">Sin datos suficientes</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">Carga órdenes para visualizar las tendencias del período</p>
    </div>
  )
}
