/**
 * Mapa de secciones navegables por el asistente IA.
 * Cada destino se mapea a una ruta concreta del App Router.
 * Mantener sincronizado con el `inputSchema` de la tool `navegar` en tools.ts.
 */

export const NAVIGATION_DESTINATIONS = [
  'inicio',
  'dashboard',
  'ordenes',
  'nueva_orden',
  'cirugias',
  'nueva_cirugia',
  'liquidaciones',
  'nueva_liquidacion',
  'debitos',
  'nuevo_debito',
  'nomenclador',
  'reportes',
  'perfil',
] as const

export type NavigationDestination = (typeof NAVIGATION_DESTINATIONS)[number]

export const NAVIGATION_ROUTES: Record<NavigationDestination, string> = {
  inicio: '/',
  dashboard: '/dashboard',
  ordenes: '/ordenes',
  nueva_orden: '/ordenes/nueva',
  cirugias: '/cirugias',
  nueva_cirugia: '/cirugias/nueva',
  liquidaciones: '/liquidaciones',
  nueva_liquidacion: '/liquidaciones/nueva',
  debitos: '/debitos',
  nuevo_debito: '/debitos/nuevo',
  nomenclador: '/nomenclador',
  reportes: '/reportes',
  perfil: '/perfil',
}

export const NAVIGATION_LABELS: Record<NavigationDestination, string> = {
  inicio: 'Inicio (asistente)',
  dashboard: 'Dashboard con KPIs del mes',
  ordenes: 'Listado de órdenes médicas (1° Nivel)',
  nueva_orden: 'Formulario para registrar una orden nueva',
  cirugias: 'Listado de cirugías',
  nueva_cirugia: 'Formulario para registrar una cirugía nueva',
  liquidaciones: 'Listado de liquidaciones (cobros recibidos)',
  nueva_liquidacion: 'Formulario para cargar una liquidación',
  debitos: 'Listado de débitos aplicados',
  nuevo_debito: 'Formulario para registrar un débito',
  nomenclador: 'Buscador de códigos OSEP (1148 prácticas)',
  reportes: 'Reportes con KPIs y gráficos',
  perfil: 'Perfil del médico',
}
