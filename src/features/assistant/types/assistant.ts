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

// Sugerencias navegacionales: orientan al usuario hacia secciones de la app o
// acciones rápidas. Todas envían directo (el agente responde con navegación o
// con la consulta correspondiente).
export const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  {
    label: 'Quiero ver mis órdenes médicas',
    text: 'Llevame a mis órdenes médicas',
    send: true,
  },
  {
    label: 'Revisar liquidaciones',
    text: 'Mostrame mis liquidaciones',
    send: true,
  },
  {
    label: 'Calcular una práctica',
    text: 'Buscame un código del nomenclador',
    send: true,
  },
  {
    label: 'Registrar una orden',
    text: 'Quiero registrar una nueva orden',
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
