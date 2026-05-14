'use client'

import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PieChart as PieIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MOTIVO_LABELS } from '../types/debitos'
import type { Debito, MotivoDebito } from '../types/debitos'

const MOTIVO_COLORS: Record<MotivoDebito, string> = {
  falta_token: '#ef4444', // red-500
  falta_firma: '#f59e0b', // amber-500
  falta_diagnostico: '#eab308', // yellow-500
  no_autorizada: '#a855f7', // purple-500
  error_codigo: '#3b82f6', // blue-500
  otro: '#6b7280', // gray-500
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

interface PieData {
  name: string
  value: number
  motivo: MotivoDebito
}

export function DebitosPieChart() {
  const [data, setData] = useState<PieData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: debitos } = await supabase.from('debitos').select('motivo, monto')

      if (!debitos || debitos.length === 0) {
        setData([])
        setLoading(false)
        return
      }

      const grouped = new Map<MotivoDebito, number>()
      for (const d of debitos as Pick<Debito, 'motivo' | 'monto'>[]) {
        const current = grouped.get(d.motivo) ?? 0
        grouped.set(d.motivo, current + Number(d.monto))
      }

      const pieData: PieData[] = Array.from(grouped.entries())
        .map(([motivo, value]) => ({
          name: MOTIVO_LABELS[motivo],
          value,
          motivo,
        }))
        .sort((a, b) => b.value - a.value)

      setData(pieData)
      setLoading(false)
    }

    fetchData()
  }, [])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 h-full">
      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <PieIcon className="h-4 w-4 text-amber-500" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Distribucion por motivo</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-[280px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[280px] text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-muted/40 rounded-full blur-lg" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border">
                <PieIcon className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-sm font-medium text-foreground">Sin datos para mostrar</p>
            <p className="text-xs text-muted-foreground mt-1">Carga debitos para ver el analisis</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {data.map((entry) => (
                    <Cell key={entry.motivo} fill={MOTIVO_COLORS[entry.motivo]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => ARS.format(Number(value ?? 0))}
                  contentStyle={{
                    backgroundColor: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
                    fontSize: '13px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {data.map((entry) => (
                <div key={entry.motivo} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MOTIVO_COLORS[entry.motivo] }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">{ARS.format(entry.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
