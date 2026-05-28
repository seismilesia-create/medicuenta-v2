import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.1.248',
    '192.168.1.0/24',
    '*.loca.lt',
    'medicuenta-dev.loca.lt',
  ],
  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
  },
}

export default nextConfig
