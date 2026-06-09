import { normalizeRecipient } from './client'

/**
 * True si el remitente entrante es el médico dueño del canal.
 * Compara normalizando el "9" argentino para evitar el desencuentro 549.. vs 54..
 */
export function esRemitenteMedico(from: string, numeroPersonal: string): boolean {
  return normalizeRecipient(from) === normalizeRecipient(numeroPersonal)
}
