import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cobro, ConceptoCobro, MedioCobro } from '@/features/cobros/types/cobros'
import {
  actualizarMontoEnMano,
  anularCobro,
  crearCobro,
  getCobroVivoDeOrden,
  vincularOrden,
} from '@/features/cobros/services/cobrosService'

// Sync unidireccional orden → ledger: `ordenes.monto_plus`/`monto_particular`
// siguen siendo la fuente de Reportes; acá se refleja esa plata en `cobros`
// (medio de pago, MP, rendición diaria). Nunca al revés: un cobro MercadoPago
// acreditado es inmutable y la UI bloquea editar ese monto en la orden.

export type AccionSyncCobro =
  | { tipo: 'nada'; motivo: string }
  | { tipo: 'insertar' }
  | { tipo: 'actualizar_monto' }
  | { tipo: 'anular' }

/** Decisión pura para el camino de EDICIÓN de una orden (testeable sin DB). */
export function decidirSyncCobro(args: {
  montoOrden: number
  cobro: Pick<Cobro, 'monto' | 'medio' | 'estado'> | null
}): AccionSyncCobro {
  const { montoOrden, cobro } = args
  if (!cobro) {
    if (montoOrden > 0) return { tipo: 'insertar' }
    return { tipo: 'nada', motivo: 'sin cobro y sin monto' }
  }
  if (cobro.medio === 'mercadopago') {
    // La verdad de un cobro MP es lo acreditado (o lo que espera el link vivo):
    // no se toca desde la orden. La UI muestra el monto read-only.
    return { tipo: 'nada', motivo: 'cobro mercadopago: inmutable desde la orden' }
  }
  if (montoOrden <= 0) return { tipo: 'anular' }
  if (Number(cobro.monto) !== montoOrden) return { tipo: 'actualizar_monto' }
  return { tipo: 'nada', motivo: 'sin cambios' }
}

export interface SyncOrdenInput {
  medicoId: string
  ordenId: string
  /** 'plus' para obra social, 'consulta_particular' para particulares. */
  concepto: ConceptoCobro
  /** monto_plus u monto_particular según el tipo de la orden. */
  monto: number
  medio?: MedioCobro
  /** Cobro pre-existente elegido en el form (link MP generado / cobro del check-in). */
  cobroId?: string
  turnoId?: string | null
  pacienteNombre?: string | null
  registradoPor: string
}

/**
 * Tras CREAR una orden: vincula el cobro pre-existente del form, o inserta el
 * cobro en mano si se declaró plata. Nunca lanza: la orden ya está guardada y
 * un tropiezo del ledger no debe romperla (se loguea y se sigue).
 */
export async function syncCobroAlCrearOrden(db: SupabaseClient, input: SyncOrdenInput): Promise<void> {
  try {
    if (input.cobroId) {
      await vincularOrden(db, input.medicoId, input.cobroId, input.ordenId)
      return
    }
    if (input.monto > 0) {
      await crearCobro(db, {
        medicoId: input.medicoId,
        concepto: input.concepto,
        monto: input.monto,
        medio: input.medio ?? 'efectivo',
        estado: 'cobrado',
        ordenId: input.ordenId,
        turnoId: input.turnoId ?? null,
        pacienteNombre: input.pacienteNombre ?? null,
        registradoPor: input.registradoPor,
      })
    }
  } catch (e) {
    console.error('[cobros] syncCobroAlCrearOrden:', e)
  }
}

/** Tras EDITAR una orden: alinea el cobro vivo con el monto declarado. */
export async function syncCobroAlEditarOrden(db: SupabaseClient, input: SyncOrdenInput): Promise<void> {
  try {
    if (input.cobroId) {
      // El form eligió un cobro (p.ej. generó link MP durante la edición): solo vincular.
      await vincularOrden(db, input.medicoId, input.cobroId, input.ordenId)
      return
    }
    const cobro = await getCobroVivoDeOrden(db, input.medicoId, input.ordenId)
    const accion = decidirSyncCobro({ montoOrden: input.monto, cobro })
    switch (accion.tipo) {
      case 'insertar':
        await crearCobro(db, {
          medicoId: input.medicoId,
          concepto: input.concepto,
          monto: input.monto,
          medio: input.medio ?? 'efectivo',
          estado: 'cobrado',
          ordenId: input.ordenId,
          turnoId: input.turnoId ?? null,
          pacienteNombre: input.pacienteNombre ?? null,
          registradoPor: input.registradoPor,
        })
        break
      case 'actualizar_monto':
        if (cobro) await actualizarMontoEnMano(db, input.medicoId, cobro.id, input.monto)
        break
      case 'anular':
        if (cobro) await anularCobro(db, input.medicoId, cobro.id)
        break
      case 'nada':
        break
    }
  } catch (e) {
    console.error('[cobros] syncCobroAlEditarOrden:', e)
  }
}
