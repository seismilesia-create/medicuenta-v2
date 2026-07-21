/**
 * Mapa de secciones navegables por el asistente IA.
 * Cada destino se mapea a una ruta concreta del App Router.
 *
 * FUENTE DE VERDAD del enum de la tool `navegar` (tools.ts la consume directo con
 * z.enum). Al agregar una ruta nueva a la app, sumala también acá o el asistente
 * no va a poder navegar a ella (el modelo cae en el destino más cercano, ej. inicio).
 * Los Record de abajo están tipados por NavigationDestination → tsc obliga a que
 * cada destino tenga ruta y label (no se puede olvidar ninguno).
 */

export const NAVIGATION_DESTINATIONS = [
  // Facturación
  'inicio',
  'dashboard',
  'ordenes',
  'nueva_orden',
  'presentaciones',
  'liquidaciones',
  'nueva_liquidacion',
  'debitos',
  'nuevo_debito',
  'cirugias',
  'nomenclador',
  'reportes',
  // Consultorio (plan Full)
  'agenda',
  'conversaciones',
  'pacientes',
  'asistente_turnos',
  // Cuenta
  'perfil',
] as const

export type NavigationDestination = (typeof NAVIGATION_DESTINATIONS)[number]

export const NAVIGATION_ROUTES: Record<NavigationDestination, string> = {
  inicio: '/',
  dashboard: '/dashboard',
  ordenes: '/ordenes',
  nueva_orden: '/ordenes/nueva',
  presentaciones: '/ordenes/presentaciones',
  liquidaciones: '/liquidaciones',
  nueva_liquidacion: '/liquidaciones/nueva',
  debitos: '/debitos',
  nuevo_debito: '/debitos/nuevo',
  cirugias: '/cirugias',
  nomenclador: '/nomenclador',
  reportes: '/reportes',
  agenda: '/agenda',
  conversaciones: '/conversaciones',
  pacientes: '/pacientes',
  asistente_turnos: '/consultorio/config',
  perfil: '/perfil',
}

export const NAVIGATION_LABELS: Record<NavigationDestination, string> = {
  inicio: 'Inicio (asistente)',
  dashboard: 'Dashboard con KPIs del mes',
  ordenes: 'Listado de órdenes médicas (Nivel 1 y Nivel 2)',
  nueva_orden: 'Formulario para registrar una orden nueva (Nivel 1 por foto / Nivel 2 foja por voz)',
  presentaciones: 'Presentaciones a las obras sociales (planillas emitidas)',
  liquidaciones: 'Listado de liquidaciones (cobros recibidos)',
  nueva_liquidacion: 'Formulario para cargar una liquidación',
  debitos: 'Listado de débitos aplicados',
  nuevo_debito: 'Formulario para registrar un débito',
  cirugias: 'Listado de cirugías (Nivel 2)',
  nomenclador: 'Buscador de códigos OSEP (1148 prácticas)',
  reportes: 'Reportes con KPIs y gráficos',
  agenda: 'Agenda de turnos del consultorio',
  conversaciones: 'Conversaciones de WhatsApp con pacientes',
  pacientes: 'Listado de pacientes del consultorio',
  asistente_turnos: 'Asistente de turnos — bot de WhatsApp del consultorio (horarios, obras sociales, configuración)',
  perfil: 'Perfil del médico',
}
