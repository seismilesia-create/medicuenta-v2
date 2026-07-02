import type { AgenteFacturador } from '@/features/ordenes/types/ordenes'
import type { MotivoDebito } from '@/features/debitos/types/debitos'
import type {
  ReportesFilters,
  ReportesData,
  ReporteKPIs,
  TendenciaPoint,
  FacturacionPorOSPoint,
  DebitosPorMotivoPoint,
  DescuentosApiladosPoint,
  PlusMensualPoint,
  InstitucionPendientePoint,
  TablaMesRow,
  MonthPoint,
  OrdenRow,
  CirugiaRow,
  DebitoRow,
} from '../types/reportes'

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function monthLabel(d: Date): string {
  const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function lastNMonths(n: number, now: Date = new Date()): MonthPoint[] {
  const result: MonthPoint[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    result.push({ key, label: monthLabel(d) })
  }
  return result
}

function ordenFacturado(o: OrdenRow): number {
  return Number(o.honorario_calculado || 0) + Number(o.monto_particular || 0)
}

function cirugiaFacturado(c: CirugiaRow): number {
  return Number(c.total_calculado || 0)
}

function inRange(fecha: string, desde: string, hasta: string): boolean {
  return fecha >= desde && fecha <= hasta
}

function applyOrdenFilters(o: OrdenRow, filters: ReportesFilters, desde: string, hasta: string): boolean {
  if (!inRange(o.fecha_atencion, desde, hasta)) return false
  if (filters.obra_social && o.obra_social !== filters.obra_social) return false
  if (filters.agente !== 'todos' && o.agente_facturador !== filters.agente) return false
  if (filters.tipo === 'cirugias') return false
  return true
}

function applyCirugiaFilters(c: CirugiaRow, filters: ReportesFilters, desde: string, hasta: string): boolean {
  if (!inRange(c.fecha, desde, hasta)) return false
  if (filters.obra_social && c.obra_social !== filters.obra_social) return false
  if (filters.agente !== 'todos' && c.agente_facturador !== filters.agente) return false
  if (filters.nivel !== 'ambos' && String(c.nivel) !== filters.nivel) return false
  if (filters.institucion && (c.institucion ?? '') !== filters.institucion) return false
  if (filters.tipo === 'consultas') return false
  return true
}

function applyDebitoFilters(d: DebitoRow, filters: ReportesFilters, desde: string, hasta: string): boolean {
  if (!inRange(d.fecha, desde, hasta)) return false
  // Al filtrar por una OS, los débitos de otras (y los viejos sin OS) quedan afuera.
  if (filters.obra_social && d.obra_social !== filters.obra_social) return false
  return true
}

export function computeKPIs(
  ordenes: OrdenRow[],
  cirugias: CirugiaRow[],
  debitos: DebitoRow[],
  filters: ReportesFilters,
  desde: string,
  hasta: string,
  now: Date = new Date(),
): ReporteKPIs {
  let facturado = 0
  let cobrado = 0
  let plus = 0
  const descuentoPorAgente: Record<AgenteFacturador, number> = {
    circulo_medico: 0,
    medical_group: 0,
    comunidad: 0,
  }

  for (const o of ordenes) {
    if (!applyOrdenFilters(o, filters, desde, hasta)) continue
    const monto = ordenFacturado(o)
    facturado += monto
    if (o.estado === 'aprobada') cobrado += monto
    plus += Number(o.monto_plus || 0)
  }

  for (const c of cirugias) {
    if (!applyCirugiaFilters(c, filters, desde, hasta)) continue
    const monto = cirugiaFacturado(c)
    facturado += monto
    if (c.estado === 'aprobada') cobrado += monto
  }

  for (const d of debitos) {
    if (!applyDebitoFilters(d, filters, desde, hasta)) continue
  }
  const debitosMonto = debitos
    .filter(d => applyDebitoFilters(d, filters, desde, hasta))
    .reduce((acc, d) => acc + Number(d.monto || 0), 0)

  // Descuentos agrupados por agente facturador (cuando aplicado_por es un agente)
  for (const d of debitos) {
    if (!applyDebitoFilters(d, filters, desde, hasta)) continue
    const por = d.aplicado_por
    if (por && por in descuentoPorAgente) {
      descuentoPorAgente[por as AgenteFacturador] += Number(d.monto || 0)
    }
  }

  // Cirugías 2° Nivel sin liquidar > 90 días
  // El reloj cuenta desde fecha_alta_paciente (si existe) o fecha de cirugía.
  // Los plazos reales son 3 meses OSEP, 5-6 meses MG/Comunidad.
  const limite90 = new Date(now)
  limite90.setDate(limite90.getDate() - 90)
  const limite90Str = `${limite90.getFullYear()}-${String(limite90.getMonth() + 1).padStart(2, '0')}-${String(limite90.getDate()).padStart(2, '0')}`

  let sinLiquidarCount = 0
  let sinLiquidarMonto = 0
  for (const c of cirugias) {
    if (c.nivel !== 2) continue
    if (c.estado === 'aprobada' || c.estado === 'debitada') continue
    const fechaReferencia = c.fecha_alta_paciente || c.fecha
    if (fechaReferencia > limite90Str) continue
    sinLiquidarCount += 1
    sinLiquidarMonto += cirugiaFacturado(c)
  }

  return {
    facturado,
    cobrado,
    debitos: debitosMonto,
    plus,
    cirugias2doSinLiquidar: { count: sinLiquidarCount, monto: sinLiquidarMonto },
    descuentoPorAgente,
  }
}

export function computeTendencia(
  ordenes: OrdenRow[],
  cirugias: CirugiaRow[],
  debitos: DebitoRow[],
  filters: ReportesFilters,
  now: Date = new Date(),
): TendenciaPoint[] {
  const months = lastNMonths(6, now)
  const result: TendenciaPoint[] = months.map(m => ({ ...m, facturado: 0, cobrado: 0, debitos: 0 }))

  for (const o of ordenes) {
    if (filters.obra_social && o.obra_social !== filters.obra_social) continue
    if (filters.agente !== 'todos' && o.agente_facturador !== filters.agente) continue
    if (filters.tipo === 'cirugias') continue
    const key = monthKey(o.fecha_atencion)
    const idx = result.findIndex(r => r.key === key)
    if (idx === -1) continue
    const monto = ordenFacturado(o)
    result[idx].facturado += monto
    if (o.estado === 'aprobada') result[idx].cobrado += monto
  }

  for (const c of cirugias) {
    if (filters.obra_social && c.obra_social !== filters.obra_social) continue
    if (filters.agente !== 'todos' && c.agente_facturador !== filters.agente) continue
    if (filters.nivel !== 'ambos' && String(c.nivel) !== filters.nivel) continue
    if (filters.institucion && (c.institucion ?? '') !== filters.institucion) continue
    if (filters.tipo === 'consultas') continue
    const key = monthKey(c.fecha)
    const idx = result.findIndex(r => r.key === key)
    if (idx === -1) continue
    const monto = cirugiaFacturado(c)
    result[idx].facturado += monto
    if (c.estado === 'aprobada') result[idx].cobrado += monto
  }

  for (const d of debitos) {
    const key = monthKey(d.fecha)
    const idx = result.findIndex(r => r.key === key)
    if (idx === -1) continue
    result[idx].debitos += Number(d.monto || 0)
  }

  return result
}

export function computeFacturacionPorOS(
  ordenes: OrdenRow[],
  cirugias: CirugiaRow[],
  filters: ReportesFilters,
  desde: string,
  hasta: string,
): FacturacionPorOSPoint[] {
  const map = new Map<string, number>()

  for (const o of ordenes) {
    if (!applyOrdenFilters(o, filters, desde, hasta)) continue
    const os = o.obra_social ?? 'Particular'
    map.set(os, (map.get(os) ?? 0) + ordenFacturado(o))
  }
  for (const c of cirugias) {
    if (!applyCirugiaFilters(c, filters, desde, hasta)) continue
    const os = c.obra_social
    map.set(os, (map.get(os) ?? 0) + cirugiaFacturado(c))
  }

  return Array.from(map.entries())
    .map(([obra_social, monto]) => ({ obra_social, monto }))
    .filter(p => p.monto > 0)
    .sort((a, b) => b.monto - a.monto)
}

export function computeDebitosPorMotivo(
  debitos: DebitoRow[],
  filters: ReportesFilters,
  desde: string,
  hasta: string,
): DebitosPorMotivoPoint[] {
  const map = new Map<MotivoDebito, { monto: number; count: number }>()
  for (const d of debitos) {
    if (!applyDebitoFilters(d, filters, desde, hasta)) continue
    const prev = map.get(d.motivo) ?? { monto: 0, count: 0 }
    map.set(d.motivo, { monto: prev.monto + Number(d.monto || 0), count: prev.count + 1 })
  }
  return Array.from(map.entries())
    .map(([motivo, v]) => ({ motivo, monto: v.monto, count: v.count }))
    .filter(p => p.monto > 0)
    .sort((a, b) => b.monto - a.monto)
}

export function computeDescuentosApilados(
  debitos: DebitoRow[],
  filters: ReportesFilters,
  now: Date = new Date(),
): DescuentosApiladosPoint[] {
  const months = lastNMonths(6, now)
  const result: DescuentosApiladosPoint[] = months.map(m => ({
    ...m,
    circulo_medico: 0,
    institucion: 0,
    medical_group: 0,
    comunidad: 0,
    obra_social: 0,
    sin_dato: 0,
  }))

  for (const d of debitos) {
    // Aplicamos solo filtro de rango visual (6 meses) aquí, no el rango del período elegido (este gráfico siempre muestra 6 meses)
    const key = monthKey(d.fecha)
    const idx = result.findIndex(r => r.key === key)
    if (idx === -1) continue
    const monto = Number(d.monto || 0)
    const por = d.aplicado_por ?? 'sin_dato'
    if (por === 'circulo_medico') result[idx].circulo_medico += monto
    else if (por === 'institucion') result[idx].institucion += monto
    else if (por === 'medical_group') result[idx].medical_group += monto
    else if (por === 'comunidad') result[idx].comunidad += monto
    else if (por === 'obra_social') result[idx].obra_social += monto
    else result[idx].sin_dato += monto
  }
  return result
}

export function computePlusMensual(
  ordenes: OrdenRow[],
  filters: ReportesFilters,
  now: Date = new Date(),
): PlusMensualPoint[] {
  const months = lastNMonths(6, now)
  const result: PlusMensualPoint[] = months.map(m => ({ ...m, monto: 0 }))

  for (const o of ordenes) {
    if (filters.obra_social && o.obra_social !== filters.obra_social) continue
    if (filters.agente !== 'todos' && o.agente_facturador !== filters.agente) continue
    const key = monthKey(o.fecha_atencion)
    const idx = result.findIndex(r => r.key === key)
    if (idx === -1) continue
    result[idx].monto += Number(o.monto_plus || 0)
  }
  return result
}

export function computeInstitucionPendiente(
  cirugias: CirugiaRow[],
  now: Date = new Date(),
): InstitucionPendientePoint[] {
  const limite90 = new Date(now)
  limite90.setDate(limite90.getDate() - 90)
  const limite90Str = `${limite90.getFullYear()}-${String(limite90.getMonth() + 1).padStart(2, '0')}-${String(limite90.getDate()).padStart(2, '0')}`

  const map = new Map<string, { monto: number; count: number }>()
  for (const c of cirugias) {
    if (c.nivel !== 2) continue
    if (c.estado === 'aprobada' || c.estado === 'debitada') continue
    const fechaReferencia = c.fecha_alta_paciente || c.fecha
    if (fechaReferencia > limite90Str) continue
    const inst = c.institucion?.trim() || 'Sin institución'
    const prev = map.get(inst) ?? { monto: 0, count: 0 }
    map.set(inst, { monto: prev.monto + cirugiaFacturado(c), count: prev.count + 1 })
  }

  return Array.from(map.entries())
    .map(([institucion, v]) => ({ institucion, monto: v.monto, count: v.count }))
    .filter(p => p.monto > 0)
    .sort((a, b) => b.monto - a.monto)
}

export function computeTabla12Meses(
  ordenes: OrdenRow[],
  cirugias: CirugiaRow[],
  debitos: DebitoRow[],
  filters: ReportesFilters,
  now: Date = new Date(),
): TablaMesRow[] {
  const months = lastNMonths(12, now)
  const rows: TablaMesRow[] = months.map(m => ({ ...m, facturado: 0, cobrado: 0, debitos: 0, plus: 0, neto: 0 }))

  for (const o of ordenes) {
    if (filters.obra_social && o.obra_social !== filters.obra_social) continue
    if (filters.agente !== 'todos' && o.agente_facturador !== filters.agente) continue
    if (filters.tipo === 'cirugias') continue
    const key = monthKey(o.fecha_atencion)
    const idx = rows.findIndex(r => r.key === key)
    if (idx === -1) continue
    const monto = ordenFacturado(o)
    rows[idx].facturado += monto
    if (o.estado === 'aprobada') rows[idx].cobrado += monto
    rows[idx].plus += Number(o.monto_plus || 0)
  }

  for (const c of cirugias) {
    if (filters.obra_social && c.obra_social !== filters.obra_social) continue
    if (filters.agente !== 'todos' && c.agente_facturador !== filters.agente) continue
    if (filters.nivel !== 'ambos' && String(c.nivel) !== filters.nivel) continue
    if (filters.institucion && (c.institucion ?? '') !== filters.institucion) continue
    if (filters.tipo === 'consultas') continue
    const key = monthKey(c.fecha)
    const idx = rows.findIndex(r => r.key === key)
    if (idx === -1) continue
    const monto = cirugiaFacturado(c)
    rows[idx].facturado += monto
    if (c.estado === 'aprobada') rows[idx].cobrado += monto
  }

  for (const d of debitos) {
    const key = monthKey(d.fecha)
    const idx = rows.findIndex(r => r.key === key)
    if (idx === -1) continue
    rows[idx].debitos += Number(d.monto || 0)
  }

  for (const row of rows) {
    row.neto = row.cobrado + row.plus - row.debitos
  }

  return rows
}

export function buildReportesData(
  ordenes: OrdenRow[],
  cirugias: CirugiaRow[],
  debitos: DebitoRow[],
  filters: ReportesFilters,
  rango: { desde: string; hasta: string },
  now: Date = new Date(),
): ReportesData {
  const kpis = computeKPIs(ordenes, cirugias, debitos, filters, rango.desde, rango.hasta, now)
  const tendencia = computeTendencia(ordenes, cirugias, debitos, filters, now)
  const facturacionPorOS = computeFacturacionPorOS(ordenes, cirugias, filters, rango.desde, rango.hasta)
  const debitosPorMotivo = computeDebitosPorMotivo(debitos, filters, rango.desde, rango.hasta)
  const descuentosApilados = computeDescuentosApilados(debitos, filters, now)
  const plusMensual = computePlusMensual(ordenes, filters, now)
  const institucionPendiente = computeInstitucionPendiente(cirugias, now)
  const tabla12Meses = computeTabla12Meses(ordenes, cirugias, debitos, filters, now)

  const osSet = new Set<string>()
  for (const o of ordenes) if (o.obra_social) osSet.add(o.obra_social)
  for (const c of cirugias) if (c.obra_social) osSet.add(c.obra_social)

  const instSet = new Set<string>()
  for (const c of cirugias) if (c.institucion && c.institucion.trim()) instSet.add(c.institucion.trim())

  return {
    filters,
    kpis,
    tendencia,
    facturacionPorOS,
    debitosPorMotivo,
    descuentosApilados,
    plusMensual,
    institucionPendiente,
    tabla12Meses,
    obrasSocialesDisponibles: Array.from(osSet).sort(),
    institucionesDisponibles: Array.from(instSet).sort(),
    rango,
  }
}
