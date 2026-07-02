/**
 * Fecha 'YYYY-MM-DD' de un instante dado, en horario de Argentina (Catamarca, UTC-3),
 * sin depender del huso horario del server ni del browser. Testeable con un Date fijo.
 */
export function fechaEnArgentina(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Catamarca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Hoy en formato 'YYYY-MM-DD' en horario de Argentina.
 * Reemplaza a `new Date().toISOString().split('T')[0]`, que devuelve el día
 * siguiente entre las 21:00 y la medianoche de Argentina (el server corre en UTC).
 */
export function hoyArgentina(): string {
  return fechaEnArgentina(new Date())
}
