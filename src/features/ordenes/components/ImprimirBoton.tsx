'use client'

export function ImprimirBoton() {
  return (
    <button
      data-no-print
      onClick={() => window.print()}
      className="px-4 py-2.5 rounded-lg text-sm font-medium text-white"
      style={{ background: 'var(--color-primary)' }}
    >
      Imprimir / Guardar PDF
    </button>
  )
}
