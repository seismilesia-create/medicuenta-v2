import { describe, expect, it } from 'vitest'
import { armarResumenDia, type OrdenCierre, type TurnoCierre } from './resumen'

const FECHA = '2026-07-23'
const NOW = new Date('2026-07-23T20:00:00.000Z').getTime() // 17:00 AR

function orden(over: Partial<OrdenCierre> = {}): OrdenCierre {
  return {
    id: 'o1',
    tipo: 'obra_social',
    nombre_paciente: 'Pérez, Ana',
    obra_social: 'OSEP',
    codigo_os: 327,
    honorario_calculado: 12000,
    fecha_atencion: FECHA,
    nro_comprobante: '111',
    turno_id: null,
    ...over,
  }
}

function turno(over: Partial<TurnoCierre> = {}): TurnoCierre {
  return {
    id: 't1',
    estado: 'reservado',
    starts_at: '2026-07-23T13:00:00.000Z', // 10:00 AR (pasado ⇒ atendido)
    checkin_at: null,
    paciente: 'Pérez, Ana',
    ...over,
  }
}

const base = {
  fecha: FECHA,
  ordenes: [] as OrdenCierre[],
  cobrosCobrados: [],
  cobrosPendientes: [],
  recetasPagadasMontos: [] as number[],
  recetasLiberadas: 0,
  nrosOrdenReceta: [] as string[],
  turnos: [] as TurnoCierre[],
  nowMs: NOW,
}

describe('armarResumenDia', () => {
  it('agrupa órdenes por OS con honorarios (particulares afuera de la planilla)', () => {
    const r = armarResumenDia({
      ...base,
      ordenes: [
        orden(),
        orden({ id: 'o2', obra_social: 'O.S.E.P.', codigo_os: 327, honorario_calculado: 12000 }),
        orden({ id: 'o3', obra_social: 'PAMI', codigo_os: 186, honorario_calculado: 9000 }),
        orden({ id: 'o4', tipo: 'particular', obra_social: null, codigo_os: null }),
      ],
    })
    expect(r.ordenes.total).toBe(3)
    expect(r.ordenes.porOs).toHaveLength(2)
    expect(r.ordenes.porOs[0]).toEqual({ os: 'OSEP', cantidad: 2, honorarios: 24000 })
    expect(r.ordenes.honorariosTotal).toBe(33000)
  })

  it('marca las órdenes cargadas hoy con atención de otro día', () => {
    const r = armarResumenDia({ ...base, ordenes: [orden({ fecha_atencion: '2026-07-21' })] })
    expect(r.ordenes.fueraDeFecha).toHaveLength(1)
    expect(r.ordenes.fueraDeFecha[0].fechaAtencion).toBe('2026-07-21')
  })

  it('marca las órdenes que vienen de recetas (N° usado para liberar)', () => {
    const r = armarResumenDia({
      ...base,
      ordenes: [orden({ nro_comprobante: '555' }), orden({ id: 'o2', nro_comprobante: '777' })],
      nrosOrdenReceta: ['555'],
    })
    expect(r.ordenes.deRecetas).toHaveLength(1)
    expect(r.ordenes.deRecetas[0].id).toBe('o1')
  })

  it('caja por medio: plus y particular separados, pendientes MP aparte', () => {
    const r = armarResumenDia({
      ...base,
      cobrosCobrados: [
        { concepto: 'plus', medio: 'efectivo', monto: 8000, turno_id: null, sobreturno_id: null },
        { concepto: 'plus', medio: 'mercadopago', monto: 8000, turno_id: null, sobreturno_id: null },
        { concepto: 'consulta_particular', medio: 'transferencia', monto: 20000, turno_id: null, sobreturno_id: null },
      ],
      cobrosPendientes: [{ concepto: 'plus', medio: 'mercadopago', monto: 5000, turno_id: null, sobreturno_id: null }],
    })
    expect(r.caja.porMedio.efectivo).toBe(8000)
    expect(r.caja.porMedio.mercadopago).toBe(8000)
    expect(r.caja.porMedio.transferencia).toBe(20000)
    expect(r.caja.total).toBe(36000)
    expect(r.caja.plusTotal).toBe(16000)
    expect(r.caja.particularTotal).toBe(20000)
    expect(r.caja.pendientesMp).toBe(5000)
  })

  it('control de secretaria: atendidos sin orden NI cobro quedan en rojo', () => {
    const r = armarResumenDia({
      ...base,
      ordenes: [orden({ turno_id: 't-con-orden' })],
      cobrosCobrados: [
        { concepto: 'plus', medio: 'efectivo', monto: 8000, turno_id: 't-con-cobro', sobreturno_id: null },
      ],
      turnos: [
        turno({ id: 't-con-orden' }),
        turno({ id: 't-con-cobro', paciente: 'García, Luis' }),
        turno({ id: 't-sin-nada', paciente: 'Sosa, Marta', checkin_at: '2026-07-23T13:05:00.000Z' }),
        turno({ id: 't-futuro', starts_at: '2026-07-23T23:00:00.000Z' }), // 20:00 AR: próximo, no cuenta
        turno({ id: 't-ausente', estado: 'ausente' }),
      ],
    })
    expect(r.turnos.total).toBe(5)
    expect(r.turnos.atendidos).toBe(3)
    expect(r.turnos.noVino).toBe(1)
    expect(r.turnos.checkins).toBe(1)
    expect(r.turnos.sinOrden).toEqual([{ id: 't-sin-nada', paciente: 'Sosa, Marta' }])
  })

  it('montos DECIMAL como string de la DB no rompen las sumas', () => {
    const r = armarResumenDia({
      ...base,
      ordenes: [orden({ honorario_calculado: '12000.00' as unknown as number })],
      recetasPagadasMontos: ['5000.00' as unknown as number],
    })
    expect(r.ordenes.honorariosTotal).toBe(12000)
    expect(r.recetas.pagadasMpMonto).toBe(5000)
  })
})
