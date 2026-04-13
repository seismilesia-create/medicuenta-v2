'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/actions/auth'

export function BottomNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const isMoreActive = isActive('/debitos') || isActive('/perfil') || isActive('/nomenclador') || isActive('/cirugias')

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden z-40"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center justify-around h-16 px-2 pb-[env(safe-area-inset-bottom)]">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: isActive('/dashboard') ? 'var(--color-primary)' : 'var(--color-muted)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />
          </svg>
          <span
            className="text-[10px] font-medium"
            style={{ color: isActive('/dashboard') ? 'var(--color-primary)' : 'var(--color-muted)' }}
          >
            Inicio
          </span>
        </Link>

        {/* Ordenes */}
        <Link
          href="/ordenes"
          className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: isActive('/ordenes') ? 'var(--color-primary)' : 'var(--color-muted)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span
            className="text-[10px] font-medium"
            style={{ color: isActive('/ordenes') ? 'var(--color-primary)' : 'var(--color-muted)' }}
          >
            Ordenes
          </span>
        </Link>

        {/* FAB: Nueva Orden */}
        <div className="flex items-center justify-center flex-1">
          <Link
            href="/ordenes/nueva"
            className="flex items-center justify-center w-12 h-12 rounded-full -mt-5 shadow-lg transition-transform active:scale-95"
            style={{ backgroundColor: 'var(--color-primary)' }}
            aria-label="Nueva orden"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>

        {/* Liquidaciones */}
        <Link
          href="/liquidaciones"
          className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: isActive('/liquidaciones') ? 'var(--color-primary)' : 'var(--color-muted)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span
            className="text-[10px] font-medium"
            style={{ color: isActive('/liquidaciones') ? 'var(--color-primary)' : 'var(--color-muted)' }}
          >
            Liquidac.
          </span>
        </Link>

        {/* Mas (menu) */}
        <div className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            className="flex flex-col items-center justify-center gap-0.5"
            aria-label="Mas opciones"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: isMoreActive || menuOpen ? 'var(--color-primary)' : 'var(--color-muted)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            <span
              className="text-[10px] font-medium"
              style={{ color: isMoreActive || menuOpen ? 'var(--color-primary)' : 'var(--color-muted)' }}
            >
              Mas
            </span>
          </button>

          {/* Popup menu */}
          {menuOpen && (
            <div
              className="absolute bottom-full right-0 mb-2 w-48 rounded-xl py-2 shadow-lg animate-scale-in"
              style={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Link
                href="/nomenclador"
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: isActive('/nomenclador') ? 'var(--color-primary)' : 'var(--color-foreground)' }}
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Nomenclador
              </Link>
              <Link
                href="/cirugias"
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: isActive('/cirugias') ? 'var(--color-primary)' : 'var(--color-foreground)' }}
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                </svg>
                Cirugias
              </Link>
              <Link
                href="/debitos"
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: isActive('/debitos') ? 'var(--color-primary)' : 'var(--color-foreground)' }}
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Debitos
              </Link>
              <Link
                href="/perfil"
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: isActive('/perfil') ? 'var(--color-primary)' : 'var(--color-foreground)' }}
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Perfil
              </Link>
              <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
              <button
                onClick={() => { setMenuOpen(false); logout() }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--color-error)' }}
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar sesion
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
