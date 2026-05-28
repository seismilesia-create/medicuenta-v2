export interface SuggestedQuestion {
  label: string
  text: string
}

export const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  {
    label: 'Quiero ver mis órdenes médicas',
    text: 'Llevame a mis órdenes médicas',
  },
  {
    label: 'Revisar liquidaciones',
    text: 'Mostrame mis liquidaciones',
  },
  {
    label: 'Calcular una práctica',
    text: 'Buscame un código del nomenclador',
  },
  {
    label: 'Registrar una orden',
    text: 'Quiero registrar una nueva orden',
  },
]
