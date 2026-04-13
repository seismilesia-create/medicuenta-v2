import type { MotivoDebito } from '../types/debitos'
import { MOTIVO_LABELS } from '../types/debitos'

const MOTIVO_CONFIG: Record<MotivoDebito, { label: string; className: string }> = {
  falta_token: {
    label: MOTIVO_LABELS.falta_token,
    className: 'bg-[#FF3B30]/10 text-[#D70015] dark:bg-[#FF453A]/15 dark:text-[#FF453A]',
  },
  falta_firma: {
    label: MOTIVO_LABELS.falta_firma,
    className: 'bg-[#FF9F0A]/10 text-[#CC7F08] dark:bg-[#FF9F0A]/15 dark:text-[#FF9F0A]',
  },
  falta_diagnostico: {
    label: MOTIVO_LABELS.falta_diagnostico,
    className: 'bg-[#FFD60A]/10 text-[#B89B00] dark:bg-[#FFD60A]/15 dark:text-[#FFD60A]',
  },
  no_autorizada: {
    label: MOTIVO_LABELS.no_autorizada,
    className: 'bg-[#BF5AF2]/10 text-[#9930D3] dark:bg-[#BF5AF2]/15 dark:text-[#BF5AF2]',
  },
  error_codigo: {
    label: MOTIVO_LABELS.error_codigo,
    className: 'bg-[#0071E3]/10 text-[#0071E3] dark:bg-[#0A84FF]/15 dark:text-[#0A84FF]',
  },
  otro: {
    label: MOTIVO_LABELS.otro,
    className: 'bg-[#8E8E93]/10 text-[#8E8E93] dark:bg-[#636366]/20 dark:text-[#98989D]',
  },
}

interface Props {
  motivo: MotivoDebito
}

export function MotivoDebitoBadge({ motivo }: Props) {
  const config = MOTIVO_CONFIG[motivo]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
