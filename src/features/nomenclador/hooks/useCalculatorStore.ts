import { create } from 'zustand'
import type { Prestacion, CalculatorItem } from '../types/nomenclador'

interface CalculatorStore {
  items: CalculatorItem[]
  addItem: (prestacion: Prestacion) => void
  removeItem: (id: number) => void
  clearItems: () => void
  totalGeneral: () => number
}

function recalculate(items: CalculatorItem[]): CalculatorItem[] {
  // Sort by total descending so the most expensive gets 100%
  const sorted = [...items].sort((a, b) => b.total - a.total)

  return sorted.map((item, index) => {
    const porcentaje = index === 0 ? 100 : 50
    const honorariosCalc = item.honorarios * (porcentaje / 100)
    return {
      ...item,
      porcentajeHonorarios: porcentaje,
      honorariosCalculados: honorariosCalc,
      subtotal: honorariosCalc + item.gastos,
    }
  })
}

export const useCalculatorStore = create<CalculatorStore>((set, get) => ({
  items: [],

  addItem: (prestacion: Prestacion) => {
    const { items } = get()
    // Don't add duplicates
    if (items.some((i) => i.id === prestacion.id)) return

    const total = Number(prestacion.total) || 0
    const gastos = Number(prestacion.gastos) || 0
    const honorarios = prestacion.honorarios != null ? Number(prestacion.honorarios) : total - gastos

    const newItem: CalculatorItem = {
      id: prestacion.id,
      codigo: prestacion.codigo,
      detalle: prestacion.detalle,
      honorarios,
      gastos,
      total,
      porcentajeHonorarios: 100,
      honorariosCalculados: honorarios,
      subtotal: total,
    }

    set({ items: recalculate([...items, newItem]) })
  },

  removeItem: (id: number) => {
    const { items } = get()
    const filtered = items.filter((i) => i.id !== id)
    set({ items: recalculate(filtered) })
  },

  clearItems: () => set({ items: [] }),

  totalGeneral: () => {
    return get().items.reduce((sum, item) => sum + item.subtotal, 0)
  },
}))
