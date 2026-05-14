'use client'

import { TrendingUp, BarChart3 } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

export interface TrendDataPoint {
  month: string
  facturado: number
  cobrado: number
  debitado: number
}

interface Props {
  data: TrendDataPoint[]
}

// Colores fijos que funcionan en light y dark mode
const COLORS = {
  facturado: '#14b8a6', // teal-500 (primary)
  cobrado: '#10b981', // emerald-500
  debitado: '#ef4444', // red-500
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function DashboardTrendChart({ data }: Props) {
  const hasData = data.length > 0

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Tendencia ultimos 6 meses</h3>
              <p className="text-xs text-muted-foreground">Comparativa de facturacion, cobros y debitos</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LegendDot color={COLORS.facturado} label="Facturado" />
            <LegendDot color={COLORS.cobrado} label="Cobrado" />
            <LegendDot color={COLORS.debitado} label="Debitado" />
          </div>
        </div>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-[240px] text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
                <TrendingUp className="h-8 w-8 text-primary" strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-sm font-medium text-foreground">Sin datos suficientes</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
              Carga ordenes para visualizar la tendencia de tu facturacion.
            </p>
          </div>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradientFacturado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.facturado} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.facturado} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradientCobrado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.cobrado} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.cobrado} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradientDebitado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.debitado} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.debitado} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="month"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  dx={-10}
                />
                <Tooltip
                  formatter={(value, name) => [
                    ARS.format(Number(value ?? 0)),
                    String(name ?? '').charAt(0).toUpperCase() + String(name ?? '').slice(1),
                  ]}
                  contentStyle={{
                    backgroundColor: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
                    fontSize: '13px',
                  }}
                  labelStyle={{
                    color: 'var(--color-foreground)',
                    fontWeight: 600,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="facturado"
                  name="Facturado"
                  stroke={COLORS.facturado}
                  strokeWidth={2.5}
                  fill="url(#gradientFacturado)"
                />
                <Area
                  type="monotone"
                  dataKey="cobrado"
                  name="Cobrado"
                  stroke={COLORS.cobrado}
                  strokeWidth={2.5}
                  fill="url(#gradientCobrado)"
                />
                <Area
                  type="monotone"
                  dataKey="debitado"
                  name="Debitado"
                  stroke={COLORS.debitado}
                  strokeWidth={2.5}
                  fill="url(#gradientDebitado)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-3 w-3 rounded-full shadow-sm"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }}
      />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  )
}
