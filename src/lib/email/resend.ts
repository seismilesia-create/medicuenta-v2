/**
 * Cliente mínimo de Resend por `fetch` (sin SDK extra, mismo estilo que
 * `whatsapp/client.ts`). Lo usa el orquestador para mandarle el digest al dueño.
 *
 * Remitente: con `onboarding@resend.dev` (default) Resend permite enviar al email
 * de la propia cuenta sin verificar dominio — justo el caso del dueño. Para mandar
 * a otra casilla hay que verificar un dominio y setear `ORQUESTADOR_EMAIL_FROM`.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'MediCuenta <onboarding@resend.dev>'

interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
}

/** Envía un email. Best-effort: loguea el error y devuelve `false` (no tira). */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('Resend: RESEND_API_KEY no configurada — no se envía el email')
    return false
  }

  const from = process.env.ORQUESTADOR_EMAIL_FROM || DEFAULT_FROM

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
      }),
    })
    if (!res.ok) {
      console.error('Resend sendEmail error:', await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('Resend sendEmail exception:', e)
    return false
  }
}
