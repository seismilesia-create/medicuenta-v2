import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  FileText,
  Receipt,
  AlertTriangle,
  Scissors,
  ArrowRight,
  Zap,
  type LucideIcon,
} from 'lucide-react'

interface QuickActionItem {
  label: string
  icon: LucideIcon
  href: string
  color: 'primary' | 'sky' | 'amber' | 'blue'
}

interface Props {
  ordenesCount: number
}

const quickActions: QuickActionItem[] = [
  { label: 'Nueva orden', icon: FileText, href: '/ordenes/nueva', color: 'primary' },
  { label: 'Nueva liquidación', icon: Receipt, href: '/liquidaciones/nueva', color: 'sky' },
  { label: 'Nuevo débito', icon: AlertTriangle, href: '/debitos/nuevo', color: 'amber' },
]

const colorVariants: Record<QuickActionItem['color'], { bg: string; text: string; hover: string }> = {
  primary: { bg: 'bg-primary/10', text: 'text-primary', hover: 'hover:bg-primary/20' },
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-500', hover: 'hover:bg-sky-500/20' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', hover: 'hover:bg-amber-500/20' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', hover: 'hover:bg-blue-500/20' },
}

export function QuickActions({ ordenesCount }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Acciones rápidas</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => {
            const colors = colorVariants[action.color]
            const Icon = action.icon
            return (
              <Link
                key={action.label}
                href={action.href}
                className={cn(
                  'group flex flex-col items-center gap-3 rounded-xl p-4 transition-all duration-300',
                  colors.bg,
                  colors.hover,
                  'hover:scale-[1.02] hover:shadow-lg',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/80 transition-transform group-hover:scale-110">
                  <Icon className={cn('h-5 w-5', colors.text)} strokeWidth={1.5} />
                </div>
                <span className="text-xs font-medium text-foreground text-center">{action.label}</span>
              </Link>
            )
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-border/50">
          <Link
            href="/ordenes"
            className="group flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-accent hover:text-foreground"
          >
            <span>Ver todas las órdenes ({ordenesCount})</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  )
}
