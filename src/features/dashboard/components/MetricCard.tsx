import { cn } from '@/lib/utils'
import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { AnimatedNumber, type NumberFormat } from '@/shared/components/ui/animated-number'

interface MetricCardProps {
  /** String → se muestra tal cual. Número → cuenta animada de 0 al valor. */
  value: string | number
  /** Formato de la cuenta animada cuando `value` es número (default: ARS). */
  valueFormat?: NumberFormat
  title: string
  icon: LucideIcon
  trend?: {
    value: string
    positive: boolean
  }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  description?: string
}

const variantStyles = {
  default: {
    gradient: 'from-primary/10 via-primary/5 to-transparent',
    iconBg: 'bg-primary/15',
    iconColor: 'text-primary',
    valueColor: 'text-foreground',
    glow: 'group-hover:shadow-primary/20',
    border: 'border-primary/20',
    orb: 'bg-primary',
  },
  success: {
    gradient: 'from-sky-500/10 via-sky-500/5 to-transparent',
    iconBg: 'bg-sky-500/15',
    iconColor: 'text-sky-500',
    valueColor: 'text-sky-500',
    glow: 'group-hover:shadow-sky-500/20',
    border: 'border-sky-500/20',
    orb: 'bg-sky-500',
  },
  warning: {
    gradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
    valueColor: 'text-amber-500',
    glow: 'group-hover:shadow-amber-500/20',
    border: 'border-amber-500/20',
    orb: 'bg-amber-500',
  },
  danger: {
    gradient: 'from-red-500/10 via-red-500/5 to-transparent',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-500',
    valueColor: 'text-red-500',
    glow: 'group-hover:shadow-red-500/20',
    border: 'border-red-500/20',
    orb: 'bg-red-500',
  },
  info: {
    gradient: 'from-blue-500/10 via-blue-500/5 to-transparent',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
    valueColor: 'text-blue-500',
    glow: 'group-hover:shadow-blue-500/20',
    border: 'border-blue-500/20',
    orb: 'bg-blue-500',
  },
} as const

export function MetricCard({
  title,
  value,
  valueFormat = 'ars',
  icon: Icon,
  trend,
  variant = 'default',
  description,
}: MetricCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-card p-6 transition-all duration-500',
        'hover:shadow-2xl hover:-translate-y-1',
        styles.border,
        styles.glow,
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-50', styles.gradient)} />
      <div
        className={cn(
          'absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-30 transition-opacity duration-500 group-hover:opacity-50',
          styles.orb,
        )}
      />

      <div className="relative flex items-start justify-between">
        <div className="space-y-4">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110',
              styles.iconBg,
            )}
          >
            <Icon className={cn('h-6 w-6', styles.iconColor)} strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn('text-3xl font-bold tracking-tight mt-1', styles.valueColor)}>
              {typeof value === 'number' ? (
                <AnimatedNumber value={value} format={valueFormat} />
              ) : (
                value
              )}
            </p>
            {description && <p className="text-xs text-muted-foreground/80 mt-1">{description}</p>}
          </div>
        </div>

        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              trend.positive ? 'bg-sky-500/15 text-sky-500' : 'bg-red-500/15 text-red-500',
            )}
          >
            {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}
          </div>
        )}
      </div>
    </div>
  )
}
