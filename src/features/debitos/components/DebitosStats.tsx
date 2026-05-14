'use client'

import { useState, useEffect } from 'react'
import { Receipt, Calendar, Percent, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { MotivoDebito } from '../types/debitos'
import { MOTIVO_LABELS } from '../types/debitos'
import { MetricCard } from '@/features/dashboard/components/MetricCard'

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

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0]

    const { data: debitos } = await supabase.from('debitos').select('fecha, monto, motivo')
    const { data: ordenes } = await supabase
      .from('ordenes')
      .select('honorario_calculado, monto_particular, monto_plus, fecha_atencion')

    let totalEsteMes = 0
    let total3Meses = 0
    const motivoCount: Record<string, number> = {}

    for (const debito of debitos ?? []) {
      const monto = Number(debito.monto)
      if (debito.fecha >= startOfMonth) totalEsteMes += monto
      if (debito.fecha >= threeMonthsAgo) total3Meses += monto
      motivoCount[debito.motivo] = (motivoCount[debito.motivo] || 0) + 1
    }

    let totalFacturado = 0
    for (const orden of ordenes ?? []) {
      totalFacturado += Number(orden.honorario_calculado) + Number(orden.monto_particular) + Number(orden.monto_plus)
    }

    const porcentajeSobreFacturacion = totalFacturado > 0 ? (total3Meses / totalFacturado) * 100 : 0

    let motivoMasFrecuente = 'N/A'
    let maxCount = 0
    for (const [motivo, count] of Object.entries(motivoCount)) {
      if (count > maxCount) {
        maxCount = count
        motivoMasFrecuente = MOTIVO_LABELS[motivo as MotivoDebito] || motivo
      }
    }

    setStats({ totalEsteMes, total3Meses, porcentajeSobreFacturacion, motivoMasFrecuente })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6 h-[180px] animate-pulse" />
        ))}
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <MetricCard
        title="Debitado este mes"
        value={formatMonto(stats.totalEsteMes)}
        icon={Receipt}
        variant="danger"
        description="Descuentos del periodo actual"
      />
      <MetricCard
        title="Ultimos 3 meses"
        value={formatMonto(stats.total3Meses)}
        icon={Calendar}
        variant="danger"
        description="Acumulado trimestral"
      />
      <MetricCard
        title="% sobre facturacion"
        value={`${stats.porcentajeSobreFacturacion.toFixed(1)}%`}
        icon={Percent}
        variant="warning"
        description="Ratio de perdida"
      />
      <MetricCard
        title="Motivo frecuente"
        value={stats.motivoMasFrecuente}
        icon={Tag}
        variant="info"
        description="Principal causa de debitos"
      />
    </div>
  )
}
