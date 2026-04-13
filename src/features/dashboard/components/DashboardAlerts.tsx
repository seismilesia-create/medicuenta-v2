import Link from 'next/link'

export interface AlertItem {
  type: 'info' | 'warning' | 'error'
  message: string
  href: string
  count: number
}

interface Props {
  alerts: AlertItem[]
}

const ALERT_STYLES: Record<AlertItem['type'], { bg: string; color: string; icon: string }> = {
  info: {
    bg: 'var(--color-info-light)',
    color: 'var(--color-info)',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  warning: {
    bg: 'var(--color-warning-light)',
    color: 'var(--color-warning)',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
  error: {
    bg: 'var(--color-error-light)',
    color: 'var(--color-error)',
    icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
}

export function DashboardAlerts({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        Sin alertas por el momento. Todo esta en orden.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const style = ALERT_STYLES[alert.type]
        return (
          <Link
            key={i}
            href={alert.href}
            className="flex items-center gap-3 p-3 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: style.bg }}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: style.color }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={style.icon} />
            </svg>
            <span className="flex-1 text-sm" style={{ color: style.color }}>
              {alert.message}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: style.color, color: '#ffffff' }}
            >
              {alert.count}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
