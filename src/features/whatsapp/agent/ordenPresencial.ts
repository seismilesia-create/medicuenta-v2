/**
 * Mensaje de la vía "orden de consulta": el trámite es PRESENCIAL.
 *
 * Por qué no se deriva al chat con la secretaria (diseño anterior): la secretaria atiende a
 * varios pacientes y varios médicos a la vez —chatear uno por uno se presta a errores— y la
 * orden hay que COMPLETARLA Y FIRMARLA, cosa que por WhatsApp no se puede.
 *
 * El texto se arma acá (determinístico) y el modelo lo transmite tal cual: los horarios y
 * lugares son datos reales del médico, no algo que el LLM pueda inventar.
 */
export function componerMensajeOrdenPresencial(args: {
  /** Horario semanal ya formateado, o null si el médico no cargó horarios. */
  horariosTexto: string | null
  /** Bullets de lugares ya formateados, o null/'' si no hay lugares cargados. */
  lugaresTexto: string | null
  /** ¿El consultorio está atendiendo en este momento? Solo matiza el texto. */
  secretariaDisponible: boolean
}): string {
  const { horariosTexto, lugaresTexto, secretariaDisponible } = args

  const apertura = 'Para gestionar tu receta por obra social necesitás una orden de consulta 📋'

  const comoTramitar = [
    secretariaDisponible
      ? 'La secretaria está atendiendo ahora 🙌 Es un trámite presencial: acercate al consultorio y la completás y firmás ahí mismo con ella.'
      : horariosTexto
        ? 'Es un trámite presencial: acercate al consultorio y la completás y firmás ahí mismo con la secretaria.'
        : 'Es un trámite presencial: acercate al consultorio, en el horario de atención, y la completás y firmás ahí mismo con la secretaria.',
    'Si ya tenés una orden emitida en otro lado, traela igual — aclarale a la secretaria que es para liberar una receta electrónica, no para atenderte.',
  ].join(' ')

  const bloques = [apertura, comoTramitar]

  if (horariosTexto) bloques.push(`🕐 Horarios de atención:\n${horariosTexto}`)
  if (lugaresTexto) bloques.push(`📍 Dónde:\n${lugaresTexto}`)

  bloques.push('Apenas la secretaria reciba tu orden, te llega la receta en PDF por este mismo chat 📄')
  bloques.push('Si preferís no esperar, también la podés pagar por acá y te la envío al instante.')

  return bloques.join('\n\n')
}
