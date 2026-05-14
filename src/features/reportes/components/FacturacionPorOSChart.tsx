'use client'

import { Building2 } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { FacturacionPorOSPoint } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: FacturacionPorOSPoint[]
}

export function FacturacionPorOSChart({ data }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 h-full">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <Building2 className="h-5 w-5 text-blue-500" strokeWidth={1.5} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Facturacion por obra social</h3>
        </div>

        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} strokeOpacity={0.5} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatARSCompact(Number(v))}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="obra_social"
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                formatter={(value) => [ARS.format(Number(value ?? 0)), 'Facturado']}
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
                  fontSize: '13px',
                }}
              />
              <Bar dataKey="monto" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Sin facturacion registrada en este periodo.
          </div>
        )}
      </div>
    </div>
  )
}
