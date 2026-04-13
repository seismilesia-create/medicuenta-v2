// ============================================================
// SITE CONFIG - MediCuenta: Facturacion Medica Inteligente
// ============================================================
// App de facturacion para medicos del Circulo Medico de Catamarca
// ============================================================

export interface NavItem {
  label: string
  href: string
  icon: string
  phase?: number
  disabled?: boolean
}

export interface BillingStatus {
  key: string
  label: string
  color: string
}

export interface MediCuentaConfig {
  appName: string
  appSlogan: string
  appDescription: string
  version: string

  contact: {
    email: string
    city: string
    province: string
    country: string
  }

  navigation: {
    main: NavItem[]
    footer: NavItem[]
  }

  billingStatuses: BillingStatus[]

  orderStatuses: BillingStatus[]

  seo: {
    siteTitle: string
    titleTemplate: string
    defaultDescription: string
    locale: string
  }

  theme: {
    defaultMode: 'dark' | 'light' | 'system'
  }
}

export const siteConfig: MediCuentaConfig = {
  appName: 'MediCuenta',
  appSlogan: 'Facturacion medica inteligente',
  appDescription: 'Sistema de facturacion y liquidacion para medicos del Circulo Medico de Catamarca, Argentina.',
  version: '1.0.0',

  contact: {
    email: 'soporte@medicuenta.com',
    city: 'San Fernando del Valle de Catamarca',
    province: 'Catamarca',
    country: 'Argentina',
  },

  navigation: {
    main: [
      { label: 'Dashboard', href: '/', icon: 'dashboard' },
      { label: 'Ordenes', href: '/ordenes', icon: 'orders' },
      { label: 'Liquidaciones', href: '/liquidaciones', icon: 'settlements' },
      { label: 'Debitos', href: '/debitos', icon: 'debits' },
      { label: 'Nomenclador', href: '/nomenclador', icon: 'nomenclator', phase: 2, disabled: true },
      { label: 'Cirugias', href: '/cirugias', icon: 'surgeries', phase: 3, disabled: true },
    ],
    footer: [
      { label: 'Perfil', href: '/perfil', icon: 'profile' },
      { label: 'Cerrar sesion', href: '#logout', icon: 'logout' },
    ],
  },

  billingStatuses: [
    { key: 'pendiente', label: 'Pendiente', color: 'warning' },
    { key: 'facturado', label: 'Facturado', color: 'info' },
    { key: 'cobrado', label: 'Cobrado', color: 'success' },
    { key: 'perdido', label: 'Perdido', color: 'error' },
  ],

  orderStatuses: [
    { key: 'borrador', label: 'Borrador', color: 'borrador' },
    { key: 'presentada', label: 'Presentada', color: 'presentada' },
    { key: 'aprobada', label: 'Aprobada', color: 'aprobada' },
    { key: 'debitada', label: 'Debitada', color: 'debitada' },
  ],

  seo: {
    siteTitle: 'MediCuenta | Facturacion Medica Inteligente',
    titleTemplate: '%s | MediCuenta',
    defaultDescription: 'Sistema de facturacion medica para profesionales de la salud. Ordenes, liquidaciones, debitos y control financiero.',
    locale: 'es_AR',
  },

  theme: {
    defaultMode: 'dark',
  },
}
