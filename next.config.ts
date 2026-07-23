import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.1.248',
    '192.168.1.0/24',
    '*.loca.lt',
    'medicuenta-dev.loca.lt',
    '*.trycloudflare.com', // túnel para probar OAuth de MercadoPago (exige HTTPS público)
  ],
  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
    // Las Server Actions validan Origin contra Host aparte de allowedDevOrigins: detrás del
    // túnel el login (signInWithPassword) se bloquea en silencio y la página solo se recarga.
    serverActions: {
      allowedOrigins: ['*.trycloudflare.com', '*.loca.lt', 'localhost:3000'],
      // La foto de la orden (data URL ~200-500 KB comprimida) viaja dentro de la
      // action crearOrdenCheckin/completarFotoOrden; el default de 1mb quedaba justo.
      bodySizeLimit: '3mb',
    },
  },
}

export default nextConfig
