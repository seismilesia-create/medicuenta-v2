/**
 * URL pública del sitio para construir links server-side (invites, recovery, QR del médico,
 * enlaces de secretaria, callback de auth). Orden de preferencia:
 *  1) PUBLIC_BASE_URL — canónica y explícita (la de Production). La preferida: los links
 *     persistentes (mail de recovery, invitaciones) deben apuntar acá sin importar qué deploy
 *     los generó.
 *  2) VERCEL_PROJECT_PRODUCTION_URL — dominio de producción del proyecto, presente en TODOS
 *     los deploys (incluido preview). Un preview que genere un invite igual produce una URL
 *     de prod que funciona.
 *  3) VERCEL_URL — URL única de ESTE deploy (efímera, atada al deployment). Último recurso en
 *     Vercel antes de localhost.
 *  4) localhost — solo desarrollo local.
 *
 * Motivo: PUBLIC_BASE_URL está SOLO en el env Production → fuera de ese deploy (preview, o una
 * pestaña vieja clavada a un deploy anterior) los links salían `http://localhost:3000`.
 */
export function siteUrl(): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    conProtocolo(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    conProtocolo(process.env.VERCEL_URL) ||
    'http://localhost:3000'
  return base.replace(/\/+$/, '') // sin barra final: los callers hacen `${siteUrl()}/c/...`
}

/** Las env VERCEL_* traen el host pelado (sin protocolo); PUBLIC_BASE_URL ya lo incluye. */
function conProtocolo(host: string | undefined): string | undefined {
  if (!host) return undefined
  return /^https?:\/\//.test(host) ? host : `https://${host}`
}
