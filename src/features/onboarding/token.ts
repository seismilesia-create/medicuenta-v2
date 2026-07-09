import { randomBytes } from 'crypto'

/** Token de invitación: 32 bytes aleatorios en base64url (url-safe, un solo uso). */
export function generarTokenInvitacion(): string {
  return randomBytes(32).toString('base64url')
}

/** ¿La invitación sigue usable? Solo si está pendiente y no venció. */
export function invitacionVigente(estado: string, expiraEn: string, ahora: Date): boolean {
  return estado === 'pendiente' && ahora.getTime() < new Date(expiraEn).getTime()
}
