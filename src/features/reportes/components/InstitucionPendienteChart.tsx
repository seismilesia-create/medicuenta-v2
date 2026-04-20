'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { InstitucionPendientePoint } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: InstitucionPendientePoint[]
}

export function InstitucionPendienteChart({ data }: Props) {
  return (
    <div className="rounded-xl p-5 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
        Institución con más pendiente
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--color-foreground-muted)' }}>
        Cirugías de 2° Nivel sin liquidar hace más de 90 días (contando desde el alta del paciente si aplica).
      </p>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatARSCompact(Number(v))}
              tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="institucion"
              tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 12 }}
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
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Bar dataKey="monto" fill="var(--color-error)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-sm" style={{ color: 'var(--color-foreground-muted)' }}>
          No hay cirugías de 2° Nivel sin liquidar. Todo al día.
        </div>
      )}
    </div>
  )
}
