import { OrdenesTable } from '@/features/ordenes/components'

export const metadata = {
  title: 'Ordenes | MediCuenta',
}

export default function OrdenesPage() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <OrdenesTable />
    </div>
  )
}
