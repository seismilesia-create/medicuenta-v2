export interface SuggestedQuestion {
  label: string
  text: string
}

export const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  {
    label: '📋 Registrá una orden',
    text: 'Registrá una orden de consulta para Juan Pérez hoy, OSEP, código 420101',
  },
  {
    label: '📖 Consultá el nomenclador',
    text: 'Buscame el código de consulta de especialista',
  },
  {
    label: '📊 Múltiples prácticas',
    text: 'Cómo funciona el cálculo de múltiples prácticas OSEP?',
  },
  {
    label: '💸 Motivos de débito',
    text: 'Cuáles son los motivos de débito más comunes y cómo prevenirlos?',
  },
]
