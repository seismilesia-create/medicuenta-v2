import { OrdenesTable } from '@/features/ordenes/components'
import { OrdenesSinFoto } from '@/features/ordenes/components/OrdenesSinFoto'

export const metadata = {
  title: 'Ordenes | MediCuenta',
}

export default function OrdenesPage() {
  return (
    <>
      <div className="px-4 pt-6 md:px-8">
        <OrdenesSinFoto />
      </div>
      <OrdenesTable />
    </>
  )
}
