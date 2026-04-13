import type { EstadoOrden } from '../types/ordenes'

const STATUS_CONFIG: Record<EstadoOrden, { label: string; className: string }> = {
  borrador: {
    label: 'Borrador',
    className: 'bg-[#8E8E93]/10 text-[#8E8E93] dark:bg-[#636366]/20 dark:text-[#98989D]',
  },
  presentada: {
    label: 'Presentada',
    className: 'bg-[#0071E3]/10 text-[#0071E3] dark:bg-[#0A84FF]/15 dark:text-[#0A84FF]',
  },
  aprobada: {
    label: 'Aprobada',
    className: 'bg-[#30D158]/10 text-[#248A3D] dark:bg-[#30D158]/15 dark:text-[#30D158]',
  },
  debitada: {
    label: 'Debitada',
    className: 'bg-[#FF3B30]/10 text-[#D70015] dark:bg-[#FF453A]/15 dark:text-[#FF453A]',
  },
}

interface Props {
  estado: EstadoOrden
}

export function OrdenStatusBadge({ estado }: Props) {
  const config = STATUS_CONFIG[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
