/**
 * URL pública del sitio para construir links server-side (invites, recovery, QR del médico).
 * El proyecto usa PUBLIC_BASE_URL (NO NEXT_PUBLIC_SITE_URL, que no está seteada acá).
 */
export function siteUrl(): string {
  return process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
}
