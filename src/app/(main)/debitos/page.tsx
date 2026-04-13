import type { Metadata } from 'next'
import { DebitosStats, DebitosTable } from '@/features/debitos/components'
import { DebitosPieChart } from '@/features/debitos/components/DebitosPieChart'

export const metadata: Metadata = {
  title: 'Débitos | MediCuenta',
}

export default function DebitosPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <DebitosStats />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <DebitosTable />
        </div>
        <DebitosPieChart />
      </div>
    </div>
  )
}
