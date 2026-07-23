'use client'

import { Lock, Wallet } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { PlusMensualPoint } from '../types/reportes'
import { ARS, formatARSCompact } from '../lib/format'

interface Props {
  data: PlusMensualPoint[]
}

export function PlusMensualChart({ data }: Props) {
  const hasData = data.some((d) => d.monto > 0)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 h-full">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Wallet className="h-5 w-5 text-amber-500" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Plus cobrado por mes</h3>
              <p className="text-xs text-muted-foreground">Últimos 6 meses - dato confidencial</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-500">
            <Lock className="h-3 w-3" />
            Privado
          </span>
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
                formatter={(value) => [ARS.format(Number(value ?? 0)), 'Plus']}
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
                  fontSize: '13px',
                }}
              />
              <Bar dataKey="monto" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Sin plus registrado en los últimos 6 meses.
          </div>
        )}
      </div>
    </div>
  )
}
