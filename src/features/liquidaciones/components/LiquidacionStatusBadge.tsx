import type { EstadoLiquidacion } from '../types/liquidaciones'

const STATUS_CONFIG: Record<EstadoLiquidacion, { label: string; className: string }> = {
  pendiente: {
    label: 'Pendiente',
    className: 'bg-[#FF9F0A]/10 text-[#CC7F08] dark:bg-[#FF9F0A]/15 dark:text-[#FF9F0A]',
  },
  parcial: {
    label: 'Parcial',
    className: 'bg-[#0071E3]/10 text-[#0071E3] dark:bg-[#0A84FF]/15 dark:text-[#0A84FF]',
  },
  pagado: {
    label: 'Pagado',
    className: 'bg-[#30D158]/10 text-[#248A3D] dark:bg-[#30D158]/15 dark:text-[#30D158]',
  },
}

interface Props {
  estado: EstadoLiquidacion
}

export function LiquidacionStatusBadge({ estado }: Props) {
  const config = STATUS_CONFIG[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
