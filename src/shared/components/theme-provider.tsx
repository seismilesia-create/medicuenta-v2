'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

interface ThemeProviderProps {
  children: React.ReactNode
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
      // La landing pública es light-first: un visitante nuevo la ve clara aunque
      // el default del resto de la app sea oscuro. No afecta la preferencia guardada.
      forcedTheme={pathname === '/' ? 'light' : undefined}
    >
      {children}
    </NextThemesProvider>
  )
}
