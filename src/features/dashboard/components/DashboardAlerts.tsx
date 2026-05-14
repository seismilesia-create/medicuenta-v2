import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Bell, CheckCircle2, AlertCircle, Info, Shield, ArrowRight } from 'lucide-react'

export interface AlertItem {
  type: 'info' | 'warning' | 'error'
  message: string
  href: string
  count: number
}

interface Props {
  alerts: AlertItem[]
}

const alertStyles = {
  info: {
    icon: Info,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-500',
  },
  warning: {
    icon: AlertCircle,
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-500',
  },
  error: {
    icon: AlertCircle,
    iconColor: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-500',
  },
} as const

export function DashboardAlerts({ alerts }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 h-full">
      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Alertas activas</h3>
          </div>
          {alerts.length > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
              {alerts.length}
            </span>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 ring-1 ring-emerald-500/20">
                <Shield className="h-8 w-8 text-emerald-500" strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-sm font-medium text-foreground">Todo en orden</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
              No hay alertas pendientes. Tu facturacion esta al dia.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, i) => {
              const style = alertStyles[alert.type]
              const Icon = style.icon
              return (
                <Link
                  key={i}
                  href={alert.href}
                  className={cn(
                    'group flex items-start gap-3 rounded-xl border p-4 transition-all duration-300 hover:scale-[1.01]',
                    style.bgColor,
                    style.borderColor,
                  )}
                >
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', style.bgColor)}>
                    <Icon className={cn('h-4 w-4', style.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{alert.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold',
                        style.badgeBg,
                        style.badgeText,
                      )}
                    >
                      {alert.count}
                    </span>
                    <ArrowRight
                      className={cn(
                        'h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all',
                        style.iconColor,
                      )}
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
