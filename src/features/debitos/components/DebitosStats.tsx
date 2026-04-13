'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MotivoDebito } from '../types/debitos'
import { MOTIVO_LABELS } from '../types/debitos'

function formatMonto(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

interface StatsData {
  totalEsteMes: number
  total3Meses: number
  porcentajeSobreFacturacion: number
  motivoMasFrecuente: string
}

export function DebitosStats() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    setLoading(true)
    const supabase = createClient()

    // Get current date ranges
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0]

    // Fetch debitos
    const { data: debitos } = await supabase
      .from('debitos')
      .select('fecha, monto, motivo')

    // Fetch ordenes to calculate total facturado
    const { data: ordenes } = await supabase
      .from('ordenes')
      .select('honorario_calculado, monto_particular, monto_plus, fecha_atencion')

    let totalEsteMes = 0
    let total3Meses = 0
    const motivoCount: Record<string, number> = {}

    for (const debito of debitos ?? []) {
      const monto = Number(debito.monto)

      if (debito.fecha >= startOfMonth) {
        totalEsteMes += monto
      }
      if (debito.fecha >= threeMonthsAgo) {
        total3Meses += monto
      }

      motivoCount[debito.motivo] = (motivoCount[debito.motivo] || 0) + 1
    }

    // Calculate total facturado from ordenes
    let totalFacturado = 0
    for (const orden of ordenes ?? []) {
      totalFacturado += Number(orden.honorario_calculado) + Number(orden.monto_particular) + Number(orden.monto_plus)
    }

    // Calculate percentage
    const porcentajeSobreFacturacion = totalFacturado > 0
      ? (total3Meses / totalFacturado) * 100
      : 0

    // Find most frequent motivo
    let motivoMasFrecuente = 'N/A'
    let maxCount = 0
    for (const [motivo, count] of Object.entries(motivoCount)) {
      if (count > maxCount) {
        maxCount = count
        motivoMasFrecuente = MOTIVO_LABELS[motivo as MotivoDebito] || motivo
      }
    }

    setStats({
      totalEsteMes,
      total3Meses,
      porcentajeSobreFacturacion,
      motivoMasFrecuente,
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 md:p-7 rounded-xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="animate-pulse">
              <div className="h-4 w-24 rounded" style={{ background: 'var(--color-border)' }} />
              <div className="h-8 w-32 rounded mt-2" style={{ background: 'var(--color-border)' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!stats) return null

  const statCards = [
    {
      label: 'Debitado este mes',
      value: formatMonto(stats.totalEsteMes),
      color: 'var(--color-error)',
    },
    {
      label: 'Debitado últimos 3 meses',
      value: formatMonto(stats.total3Meses),
      color: 'var(--color-warning)',
    },
    {
      label: '% sobre facturación',
      value: `${stats.porcentajeSobreFacturacion.toFixed(1)}%`,
      color: 'var(--color-primary)',
    },
    {
      label: 'Motivo más frecuente',
      value: stats.motivoMasFrecuente,
      color: 'var(--color-muted)',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className="p-5 md:p-7 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-sm font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
            {stat.label}
          </div>
          <div className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: stat.color }}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}
