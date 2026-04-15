'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { DescuentosApiladosPoint } from '../types/reportes'
import { APLICADO_POR_LABELS } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: DescuentosApiladosPoint[]
}

const COLORS = {
  circulo_medico: '#3b82f6',
  institucion: '#f97316',
  medical_group: '#8b5cf6',
  comunidad: '#06b6d4',
  obra_social: '#ef4444',
  sin_dato: '#6b7280',
}

export function DescuentosApiladosChart({ data }: Props) {
  const hasData = data.some(
    d => d.circulo_medico + d.institucion + d.medical_group + d.comunidad + d.obra_social + d.sin_dato > 0
  )

  return (
    <div className="rounded-xl p-5 md:p-6" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
        Descuentos por entidad
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--color-foreground-muted)' }}>
        Últimos 6 meses — apilado por quién aplicó el descuento.
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
              formatter={(value, name) => [ARS.format(Number(value ?? 0)), APLICADO_POR_LABELS[String(name)] ?? String(name)]}
              contentStyle={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => APLICADO_POR_LABELS[String(value)] ?? String(value)}
            />
            <Bar dataKey="circulo_medico" stackId="a" fill={COLORS.circulo_medico} />
            <Bar dataKey="institucion" stackId="a" fill={COLORS.institucion} />
            <Bar dataKey="medical_group" stackId="a" fill={COLORS.medical_group} />
            <Bar dataKey="comunidad" stackId="a" fill={COLORS.comunidad} />
            <Bar dataKey="obra_social" stackId="a" fill={COLORS.obra_social} />
            <Bar dataKey="sin_dato" stackId="a" fill={COLORS.sin_dato} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-sm" style={{ color: 'var(--color-foreground-muted)' }}>
          Sin descuentos registrados en los últimos 6 meses.
        </div>
      )}
    </div>
  )
}
