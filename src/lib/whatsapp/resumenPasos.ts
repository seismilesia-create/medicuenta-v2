/**
 * Resumen estructurado de un turno del agente de WhatsApp (spec Fase 3 §10).
 * Convierte los `steps` del AI SDK en un objeto compacto y consultable que se
 * guarda en `wa_bitacora.detalle` — la comida del futuro orquestador (§12).
 *
 * Pura y decidible (sin DB): qué herramientas usó, si salieron bien, cuántos
 * pasos y un preview del texto. NO vuelca inputs crudos (pueden ser largos o
 * traer datos del paciente): solo nombre de tool + resultado ok/error.
 */

/** Forma mínima que necesitamos de cada paso del AI SDK (subconjunto estructural). */
export interface PasoAgente {
  toolCalls: { toolName: string }[]
  toolResults: { toolName: string; output?: unknown }[]
}

export interface ToolUsada {
  nombre: string
  ok: boolean
}

export interface ResumenAgente {
  pasos: number
  tools: ToolUsada[]
  cobros: number
  texto: string
}

const MAX_TEXTO = 200

/** Una tool sale "ok" salvo que su resultado diga lo contrario (ok:false o error). */
function toolOk(output: unknown): boolean {
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (typeof o.ok === 'boolean') return o.ok
    if (o.error) return false
  }
  return true
}

export function resumirPasosAgente(pasos: PasoAgente[], textoFinal: string): ResumenAgente {
  const tools: ToolUsada[] = []
  let cobros = 0

  for (const paso of pasos) {
    for (const tr of paso.toolResults) {
      tools.push({ nombre: tr.toolName, ok: toolOk(tr.output) })
      if (tr.toolName === 'cobrar_receta') {
        const out = tr.output as { link?: string } | undefined
        if (out?.link) cobros++
      }
    }
  }

  const texto = (textoFinal ?? '').trim()
  return {
    pasos: pasos.length,
    tools,
    cobros,
    texto: texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO)}…` : texto,
  }
}
