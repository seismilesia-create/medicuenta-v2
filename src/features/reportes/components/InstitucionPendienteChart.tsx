'use client'

import { Hospital } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { InstitucionPendientePoint } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: InstitucionPendientePoint[]
}

export function InstitucionPendienteChart({ data }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 h-full">
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
            <Hospital className="h-5 w-5 text-red-500" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Institución con más pendiente</h3>
            <p className="text-xs text-muted-foreground">Cirugías 2° sin liquidar +90 días</p>
          </div>
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
                dataKey="institucion"
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                formatter={(value, _name, item) => {
                  const payload = item && typeof item === 'object' && 'payload' in item
                    ? (item.payload as InstitucionPendientePoint | undefined)
                    : undefined
                  return [`${ARS.format(Number(value ?? 0))} · ${payload?.count ?? 0} cx`, 'Sin liquidar']
                }}
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
                  fontSize: '13px',
                }}
              />
              <Bar dataKey="monto" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No hay cirugías de 2° Nivel sin liquidar. Todo al día.
          </div>
        )}
      </div>
    </div>
  )
}
