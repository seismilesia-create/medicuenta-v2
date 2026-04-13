import { CirugiasTable } from '@/features/cirugias/components'

export const metadata = { title: 'Cirugias | MediCuenta' }

export default function CirugiasPage() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <CirugiasTable />
    </div>
  )
}
