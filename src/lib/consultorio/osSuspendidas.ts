/** Match tolerante de obras sociales suspendidas (spec Fase 3 D9/§8.4). */

export function normalizarOs(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿La OS que dijo el paciente está en la lista de suspendidas del médico?
 * Match exacto o parcial bidireccional ("osep" ↔ "OSEP Catamarca").
 * "particular" no es una obra social: nunca está suspendido.
 */
export function esOsSuspendida(suspendidas: string[], osPaciente: string): boolean {
  const os = normalizarOs(osPaciente)
  if (!os || os === 'particular') return false
  return suspendidas.some((s) => {
    const n = normalizarOs(s)
    if (!n || n === 'particular') return false
    return n === os || os.includes(n) || n.includes(os)
  })
}
