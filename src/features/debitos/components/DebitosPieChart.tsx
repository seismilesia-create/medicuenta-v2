'use client'

import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { MOTIVO_LABELS } from '../types/debitos'
import type { Debito, MotivoDebito } from '../types/debitos'

const MOTIVO_COLORS: Record<MotivoDebito, string> = {
  falta_token: '#FF3B30',
  falta_firma: '#FF9F0A',
  falta_diagnostico: '#FFD60A',
  no_autorizada: '#BF5AF2',
  error_codigo: '#0A84FF',
  otro: '#8E8E93',
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
      const { data: debitos } = await supabase
        .from('debitos')
        .select('motivo, monto')

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

  if (loading) {
    return (
      <div
        className="rounded-xl p-5 md:p-7"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
          Distribucion por motivo
        </h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        className="rounded-xl p-5 md:p-7"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
          Distribucion por motivo
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No hay datos para mostrar. Carga debitos para ver la distribucion.
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl p-5 md:p-7"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
        Distribucion por motivo
      </h2>
      <ResponsiveContainer width="100%" height={280}>
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
              backgroundColor: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
