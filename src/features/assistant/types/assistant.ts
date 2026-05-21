export interface SuggestedQuestion {
  label: string
  /**
   * Texto del mensaje. Si `send=true` se envía directo al agente (modo entrevista
   * pregunta-por-pregunta). Si `send=false` se pre-llena en el input para que el
   * médico lo complete antes de mandar.
   */
  text: string
  send?: boolean
}

// 3 plantillas envían directo → el agente entrevista de a una pregunta (paciente?
// → fecha? → OS? → ...). El consultar_nomenclador pre-llena porque la búsqueda
// es corta y se completa en una sola línea.
export const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  {
    label: '📋 Registrar orden',
    text: 'Quiero registrar una orden',
    send: true,
  },
  {
    label: '🩺 Registrar cirugía',
    text: 'Quiero registrar una cirugía',
    send: true,
  },
  {
    label: '📖 Consultar nomenclador',
    text: 'Buscame ',
    send: false,
  },
  {
    label: '💸 Registrar débito',
    text: 'Quiero registrar un débito',
    send: true,
  },
]

// Bloque estático "¿qué hago?" — se muestra en el empty state sin llamar al LLM.
export const CAPABILITIES_HELP = {
  title: '¿Qué puedo hacer por vos?',
  sections: [
    {
      icon: '📋',
      heading: 'Registrar prestaciones',
      body: 'Cargo órdenes de consulta, cirugías (1° o 2° nivel) y débitos en la BD. Confirmo siempre antes de guardar.',
    },
    {
      icon: '📖',
      heading: 'Consultar nomenclador',
      body: 'Te paso código, honorarios y total de prácticas médicas (consultas, cirugías, internaciones). Filtro fuera lo que no aplica a médicos clínicos.',
    },
    {
      icon: '📷',
      heading: 'Escanear órdenes en papel',
      body: 'Subí una foto de una orden y extraigo paciente, OS, código, diagnóstico, token y firma automáticamente.',
    },
    {
      icon: '💡',
      heading: 'Guía de uso',
      body: 'Preguntame "cómo presento órdenes", "dónde exporto", "qué es agente facturador", etc.',
    },
  ],
  tips: [
    'Escribí en lenguaje natural: "registrá consulta de Pérez OSEP hoy código 420101".',
    'No hago diagnósticos clínicos — solo facturación y nomenclador.',
    'Las conversaciones quedan guardadas. Buscalas en el sidebar.',
  ],
}
