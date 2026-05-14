'use client'

import { BarChart3 } from 'lucide-react'
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
    (d) => d.circulo_medico + d.institucion + d.medical_group + d.comunidad + d.obra_social + d.sin_dato > 0,
  )

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <BarChart3 className="h-5 w-5 text-amber-500" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Descuentos por entidad</h3>
            <p className="text-xs text-muted-foreground">Ultimos 6 meses - apilado por quien aplico el descuento</p>
          </div>
        </div>

        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} strokeOpacity={0.5} />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => formatARSCompact(Number(v))}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value, name) => [ARS.format(Number(value ?? 0)), APLICADO_POR_LABELS[String(name)] ?? String(name)]}
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
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Sin descuentos registrados en los ultimos 6 meses.
          </div>
        )}
      </div>
    </div>
  )
}
