import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/shared/components/theme-provider'
import PWARegister from '@/shared/components/pwa-register'
import { siteUrl } from '@/lib/site-url'
import './globals.css'

const TITULO = 'MediCuenta — Facturá a las obras sociales sin planillas ni papeles'
const DESCRIPCION =
  'Un asistente con IA atiende tu WhatsApp las 24 horas: da turnos, entrega recetas y cobra. Sacás una foto de la orden y la presentación de cada obra social se arma sola.'

export const metadata: Metadata = {
  // Ancla de las URLs relativas (la imagen de vista previa). Sin esto, al compartir el
  // link la card sale sin imagen: og:image queda como ruta relativa y no resuelve.
  metadataBase: new URL(siteUrl()),
  title: TITULO,
  description: DESCRIPCION,
  applicationName: 'MediCuenta',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'MediCuenta',
    statusBarStyle: 'black-translucent',
  },
  // El favicon lo aporta el file-convention `src/app/icon.svg` (logo de marca).
  // El apple-touch-icon lo detecta iOS solo en `/apple-touch-icon.png`. NO definir
  // `icons.icon` acá: taparía el favicon de marca en la pestaña.
  // La imagen la aporta `src/app/opengraph-image.tsx` (file-convention).
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    locale: 'es_AR',
    siteName: 'MediCuenta',
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRIPCION,
  },
}

export const viewport: Viewport = {
  themeColor: '#1189DE',
  // iOS: sin esto, enfocar un input con fuente <16px (text-sm) dispara el auto-zoom
  // y al cerrar el teclado la pantalla queda "zoomeada". maximum-scale=1 desactiva
  // SOLO ese zoom automático; el pellizco manual del usuario sigue funcionando
  // (iOS lo ignora para zoom iniciado por el usuario desde iOS 10).
  maximumScale: 1,
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
        {/*
          Captura del evento de instalación de la PWA. Chrome dispara
          `beforeinstallprompt` MUY temprano, casi siempre ANTES de que monte el
          primer componente de React: si el listener viviera en un `useEffect`
          el evento ya habría pasado y el botón "Instalar app" nunca se
          habilitaría. Por eso se engancha acá, en el HTML, y se guarda el
          evento en `window` para que `useInstallPWA` lo levante después.
          El `preventDefault()` evita el mini-infobar propio de Chrome: la
          instalación la ofrecemos nosotros desde el menú.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__mcInstallPrompt=e;window.dispatchEvent(new Event('mc:installable'));});window.addEventListener('appinstalled',function(){window.__mcInstallPrompt=null;window.dispatchEvent(new Event('mc:installed'));});}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <PWARegister />
      </body>
    </html>
  )
}
