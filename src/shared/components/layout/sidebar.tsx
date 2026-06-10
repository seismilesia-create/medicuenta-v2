'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  FileText,
  Receipt,
  AlertTriangle,
  BarChart3,
  Grid3X3,
  Scissors,
  Bot,
  Moon,
  Sun,
  User,
  LogOut,
  Activity,
  ChevronRight,
  Sparkles,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout } from '@/actions/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  badge?: string
}

const navigation: { principal: NavItem[]; avanzado: NavItem[] } = {
  principal: [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Ordenes', href: '/ordenes', icon: FileText },
    { name: 'Liquidaciones', href: '/liquidaciones', icon: Receipt },
    { name: 'Debitos', href: '/debitos', icon: AlertTriangle },
    { name: 'Reportes', href: '/reportes', icon: BarChart3 },
  ],
  avanzado: [
    { name: 'Nomenclador', href: '/nomenclador', icon: Grid3X3 },
    { name: 'Asistente IA', href: '/asistente', icon: Bot },
  ],
}

export function Sidebar({ nombre }: { nombre?: string | null }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = theme === 'dark'
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  const isActiveRoute = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname?.startsWith(href + '/')
  }

  const handleNavClick = () => setMobileOpen(false)

  const sidebarContent = (
    <>
      {/* Decorative gradient orbs */}
      <div className="absolute -top-20 -left-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-40 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

      {/* Logo */}
      <div className="relative flex h-20 items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/30 rounded-xl blur-lg" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
              <Activity className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-foreground">MediCuenta</span>
            <span className="text-xs font-medium text-muted-foreground">Facturacion Medica</span>
          </div>
        </div>
        {/* Close button - mobile only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-2 rounded-lg hover:bg-accent/50 text-muted-foreground"
          aria-label="Cerrar menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Divider with gradient */}
      <div className="mx-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* Navigation */}
      <nav className="relative flex-1 space-y-8 overflow-y-auto px-4 py-6">
        <NavSection title="Principal" items={navigation.principal} isActiveRoute={isActiveRoute} onNavClick={handleNavClick} />
        <NavSection title="Avanzado" items={navigation.avanzado} isActiveRoute={isActiveRoute} onNavClick={handleNavClick} />
      </nav>

      {/* Footer */}
      <div className="relative p-4 space-y-2">
        <div className="mx-2 mb-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-accent/50 hover:text-foreground"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
            {!mounted ? (
              <Moon className="h-[18px] w-[18px]" />
            ) : isDark ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
          </div>
          <span>{!mounted ? 'Modo' : isDark ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-accent/50 hover:text-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                <User className="h-[18px] w-[18px] text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">{nombre ?? 'Doctor'}</p>
                <p className="text-xs text-muted-foreground">Perfil</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/perfil" onClick={handleNavClick}>
                <User className="mr-2 h-4 w-4" />
                Ver perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                handleNavClick()
                logout()
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile header bar */}
      <div className="fixed top-0 left-0 right-0 h-14 flex md:hidden items-center px-4 z-40 bg-sidebar border-b border-border">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-accent/50"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80">
            <Activity className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold tracking-tight">MediCuenta</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-72 flex flex-col z-50 bg-sidebar text-sidebar-foreground overflow-hidden',
          'transition-transform duration-200 ease-out',
          'md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}

// ---------------------------------------------------------------------------
// NavSection
// ---------------------------------------------------------------------------

function NavSection({
  title,
  items,
  isActiveRoute,
  onNavClick,
}: {
  title: string
  items: NavItem[]
  isActiveRoute: (href: string) => boolean
  onNavClick: () => void
}) {
  return (
    <div>
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => {
          const isActive = isActiveRoute(item.href)
          const Icon = item.icon
          return (
            <li key={item.name}>
              <Link
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300',
                  isActive
                    ? 'bg-gradient-to-r from-primary/20 to-primary/5 text-primary'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-primary shadow-lg shadow-primary/50" />
                )}
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                      : 'bg-muted/50 text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-primary/20 to-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <Sparkles className="h-2.5 w-2.5" />
                    {item.badge}
                  </span>
                )}
                {isActive && !item.badge && <ChevronRight className="h-4 w-4 text-primary/60" />}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
