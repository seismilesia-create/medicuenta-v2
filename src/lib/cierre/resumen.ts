import { estadoEfectivoTurno } from '@/lib/consultorio/asistencia'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import { MEDIOS_COBRO, type MedioCobro } from '@/features/cobros/types/cobros'

// Builder PURO del Cierre del día (patrón armarDia): recibe las filas ya
// cortadas al día calendario AR y arma el resumen. Sin fechas propias ni DB.

export interface OrdenCierre {
  id: string
  tipo: string
  nombre_paciente: string
  obra_social: string | null
  codigo_os: number | null
  honorario_calculado: number
  fecha_atencion: string
  nro_comprobante: string | null
  turno_id: string | null
}

export interface CobroCierre {
  concepto: string
  medio: MedioCobro
  monto: number
  turno_id: string | null
  sobreturno_id: string | null
}

export interface TurnoCierre {
  id: string
  estado: string
  starts_at: string
  checkin_at: string | null
  paciente: string
}

export interface ResumenDia {
  fecha: string
  ordenes: {
    total: number
    honorariosTotal: number
    porOs: { os: string; cantidad: number; honorarios: number }[]
    /** Cargadas hoy pero atendidas otro día (el paciente trajo la orden después). */
    fueraDeFecha: { id: string; paciente: string; fechaAtencion: string }[]
    /** Su N° coincide con una orden usada para liberar una receta (no fue una atención real). */
    deRecetas: { id: string; paciente: string }[]
  }
  caja: {
    porMedio: Record<MedioCobro, number>
    total: number
    plusTotal: number
    particularTotal: number
    /** $ de links MP generados hoy que siguen sin pagar. */
    pendientesMp: number
  }
  recetas: { pagadasMp: number; pagadasMpMonto: number; liberadasOrden: number }
  turnos: {
    total: number
    atendidos: number
    noVino: number
    checkins: number
    /** El control de la rendición: atendidos/en sala SIN orden registrada NI cobro. */
    sinOrden: { id: string; paciente: string }[]
  }
}

export function armarResumenDia(args: {
  fecha: string
  ordenes: OrdenCierre[]
  cobrosCobrados: CobroCierre[]
  cobrosPendientes: CobroCierre[]
  recetasPagadasMontos: number[]
  recetasLiberadas: number
  /** Todos los N° de orden usados para liberar recetas del médico (flag "de receta"). */
  nrosOrdenReceta: string[]
  turnos: TurnoCierre[]
  nowMs: number
}): ResumenDia {
  const { fecha, nowMs } = args

  // ── Órdenes por OS (solo obra social: las particulares son caja, no planilla) ──
  const os = args.ordenes.filter((o) => o.tipo === 'obra_social')
  const grupos = new Map<string, { os: string; cantidad: number; honorarios: number }>()
  for (const o of os) {
    const clave = o.codigo_os != null ? `c:${o.codigo_os}` : `t:${normalizarOs(o.obra_social ?? 'sin os')}`
    const g = grupos.get(clave) ?? { os: o.obra_social ?? '(sin obra social)', cantidad: 0, honorarios: 0 }
    g.cantidad += 1
    g.honorarios += Number(o.honorario_calculado) || 0
    grupos.set(clave, g)
  }
  const nrosReceta = new Set(args.nrosOrdenReceta.map((n) => n.trim()).filter(Boolean))

  // ── Caja por medio ──
  const porMedio = Object.fromEntries(MEDIOS_COBRO.map((m) => [m, 0])) as Record<MedioCobro, number>
  let plusTotal = 0
  let particularTotal = 0
  for (const c of args.cobrosCobrados) {
    const monto = Number(c.monto) || 0
    porMedio[c.medio] = (porMedio[c.medio] ?? 0) + monto
    if (c.concepto === 'consulta_particular') particularTotal += monto
    else plusTotal += monto
  }

  // ── Turnos vs plata/órdenes ──
  const ordenPorTurno = new Set(args.ordenes.map((o) => o.turno_id).filter(Boolean))
  const cobroPorTurno = new Set(
    [...args.cobrosCobrados, ...args.cobrosPendientes].map((c) => c.turno_id).filter(Boolean),
  )
  const vivos = args.turnos.filter((t) => t.estado !== 'cancelado')
  const atendidos = vivos.filter((t) => estadoEfectivoTurno(t, nowMs) === 'atendido')
  const sinOrden = atendidos
    .filter((t) => !ordenPorTurno.has(t.id) && !cobroPorTurno.has(t.id))
    .map((t) => ({ id: t.id, paciente: t.paciente }))

  return {
    fecha,
    ordenes: {
      total: os.length,
      honorariosTotal: os.reduce((acc, o) => acc + (Number(o.honorario_calculado) || 0), 0),
      porOs: Array.from(grupos.values()).sort((a, b) => b.honorarios - a.honorarios),
      fueraDeFecha: os
        .filter((o) => o.fecha_atencion !== fecha)
        .map((o) => ({ id: o.id, paciente: o.nombre_paciente, fechaAtencion: o.fecha_atencion })),
      deRecetas: os
        .filter((o) => o.nro_comprobante && nrosReceta.has(o.nro_comprobante.trim()))
        .map((o) => ({ id: o.id, paciente: o.nombre_paciente })),
    },
    caja: {
      porMedio,
      total: Object.values(porMedio).reduce((a, b) => a + b, 0),
      plusTotal,
      particularTotal,
      pendientesMp: args.cobrosPendientes.reduce((acc, c) => acc + (Number(c.monto) || 0), 0),
    },
    recetas: {
      pagadasMp: args.recetasPagadasMontos.length,
      pagadasMpMonto: args.recetasPagadasMontos.reduce((a, b) => a + (Number(b) || 0), 0),
      liberadasOrden: args.recetasLiberadas,
    },
    turnos: {
      total: vivos.length,
      atendidos: atendidos.length,
      noVino: vivos.filter((t) => estadoEfectivoTurno(t, nowMs) === 'no_vino').length,
      checkins: vivos.filter((t) => t.checkin_at).length,
      sinOrden,
    },
  }
}
