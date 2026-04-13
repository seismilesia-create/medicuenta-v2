import type { Metadata } from 'next'
import { LiquidacionesTable } from '@/features/liquidaciones/components'

export const metadata: Metadata = {
  title: 'Liquidaciones | MediCuenta',
}

export default function LiquidacionesPage() {
  return (
    <div className="p-4 md:p-6">
      <LiquidacionesTable />
    </div>
  )
}
