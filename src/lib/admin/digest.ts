/**
 * Arma el email que el orquestador le manda al dueño (spec §6, v1b). Puro y
 * testeable: toma las `Alerta[]` que detectó `detectarAlertas` y produce asunto +
 * HTML + texto plano, más una `firma` estable del set para el dedup por cambio
 * (no reenviar lo mismo). `digest.ts` no sabe de DB ni de email: solo redacta.
 */
import type { Alerta, Severidad } from './alertas'

export interface Digest {
  hayAlertas: boolean
  cantidad: number
  /** Huella estable del set de alertas — para no reenviar si nada cambió. */
  firma: string
  asunto: string
  html: string
  texto: string
}

const ORDEN: Severidad[] = ['error', 'warning', 'info']

const ROTULO: Record<Severidad, string> = {
  error: 'Críticas',
  warning: 'Atención',
  info: 'Para tener en cuenta',
}

const COLOR: Record<Severidad, string> = {
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
}

function claveAlerta(a: Alerta): string {
  return `${a.tipo}|${a.medico}|${a.mensaje}`
}

function porSeveridad(alertas: Alerta[], sev: Severidad): Alerta[] {
  return alertas.filter((a) => a.severidad === sev)
}

function plural(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`
}

export function construirDigest(alertas: Alerta[]): Digest {
  const cantidad = alertas.length
  const hayAlertas = cantidad > 0

  // Firma: ordenada e independiente del orden de entrada.
  const firma = alertas.map(claveAlerta).sort().join('\n')

  const graves = porSeveridad(alertas, 'error').length
  const asunto = !hayAlertas
    ? 'MediCuenta · Todo en orden'
    : graves > 0
      ? `MediCuenta · ${plural(cantidad, 'alerta', 'alertas')} (${plural(graves, 'crítica', 'críticas')})`
      : `MediCuenta · ${plural(cantidad, 'alerta', 'alertas')}`

  const html = hayAlertas ? htmlConAlertas(alertas, asunto) : HTML_TODO_OK
  const texto = hayAlertas ? textoConAlertas(alertas) : TEXTO_TODO_OK

  return { hayAlertas, cantidad, firma, asunto, html, texto }
}

// ─── Render ────────────────────────────────────────────────────────────────

const TEXTO_TODO_OK = 'El orquestador no detectó problemas. Todo en orden.'
const HTML_TODO_OK = wrapHtml(
  `<p style="font-size:15px;color:#16a34a;margin:0">✓ El orquestador no detectó problemas. Todo en orden.</p>`,
)

function textoConAlertas(alertas: Alerta[]): string {
  const partes: string[] = ['El orquestador detectó:', '']
  for (const sev of ORDEN) {
    const grupo = porSeveridad(alertas, sev)
    if (grupo.length === 0) continue
    partes.push(`${ROTULO[sev]}:`)
    for (const a of grupo) partes.push(`  • ${a.medico} — ${a.mensaje}`)
    partes.push('')
  }
  partes.push('Entrá al panel del dueño para más detalle.')
  return partes.join('\n')
}

function htmlConAlertas(alertas: Alerta[], titulo: string): string {
  const bloques: string[] = [
    `<p style="font-size:15px;color:#111;margin:0 0 16px">${escape(titulo.replace('MediCuenta · ', ''))}</p>`,
  ]
  for (const sev of ORDEN) {
    const grupo = porSeveridad(alertas, sev)
    if (grupo.length === 0) continue
    bloques.push(
      `<p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:${COLOR[sev]};margin:18px 0 6px">${ROTULO[sev]}</p>`,
    )
    const items = grupo
      .map(
        (a) =>
          `<li style="margin:0 0 6px;font-size:14px;color:#222"><strong>${escape(a.medico)}</strong> — ${escape(a.mensaje)}</li>`,
      )
      .join('')
    bloques.push(`<ul style="margin:0;padding-left:18px">${items}</ul>`)
  }
  bloques.push(
    `<p style="font-size:13px;color:#666;margin:22px 0 0">Entrá al panel del dueño para más detalle.</p>`,
  )
  return wrapHtml(bloques.join(''))
}

function wrapHtml(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <p style="font-size:13px;font-weight:600;color:#0ea5e9;margin:0 0 4px">🤖 Orquestador · MediCuenta</p>
  ${inner}
</div>`
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
