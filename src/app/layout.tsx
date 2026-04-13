import type { Metadata } from 'next'
import { ThemeProvider } from '@/shared/components/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'MediCuenta | Facturacion Medica Inteligente',
  description: 'Sistema de facturacion y liquidacion para medicos del Circulo Medico de Catamarca.',
  openGraph: {
    title: 'MediCuenta | Facturacion Medica Inteligente',
    description: 'Control total de ordenes, liquidaciones y debitos para profesionales de la salud.',
    locale: 'es_AR',
    siteName: 'MediCuenta',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
