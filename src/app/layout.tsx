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
        {/*
          Detección de dispositivo SIN parpadeo (corre antes del primer paint).
          Marca <html> con `is-phone` o `is-web` y el CSS decide qué shell mostrar.
          Regla a prueba de rotación: es "celular" solo si el puntero es táctil
          (coarse) Y el lado corto físico de la pantalla es chico. Usamos el lado
          corto (min de ancho/alto) para que girar el teléfono NO lo pase a web,
          y exigimos puntero táctil para que una compu (aunque achiques la ventana)
          SIEMPRE quede en web.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=window.matchMedia('(pointer: coarse)').matches;var s=Math.min(window.screen.width,window.screen.height);document.documentElement.classList.add(c&&s<=600?'is-phone':'is-web');}catch(e){document.documentElement.classList.add('is-web');}})();`,
          }}
        />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
