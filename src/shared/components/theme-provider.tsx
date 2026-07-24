'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

interface ThemeProviderProps {
  children: React.ReactNode
}

const PAGINAS_PUBLICAS = ['/', '/terminos', '/privacidad']

function esPaginaPublica(pathname: string | null): boolean {
  return PAGINAS_PUBLICAS.includes(pathname ?? '')
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const pathname = usePathname()

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={true}
      disableTransitionOnChange
      themes={['light', 'dark']}
      // Las páginas públicas (landing y legales) son light-first: un visitante nuevo las ve
      // claras aunque el default del resto de la app sea oscuro. No afecta la preferencia
      // guardada del usuario logueado.
      forcedTheme={esPaginaPublica(pathname) ? 'light' : undefined}
    >
      {children}
    </NextThemesProvider>
  )
}
