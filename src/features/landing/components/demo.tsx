import { Captura } from './captura'
import { Reveal } from './reveal'

/**
 * Demo con capturas REALES de la app (nada de maquetas). Las pantallas que existen en
 * tema claro y oscuro alternan solas: el mismo producto, sus dos modos, sin duplicar espacio.
 * Los archivos viven en /public/capturas — si alguno falta, la tarjeta muestra su rótulo.
 */
const PANTALLAS = [
  {
    id: 'movil',
    marco: 'telefono' as const,
    // El par claro/oscuro de la MISMA pantalla: el crossfade se lee como un cambio de tema.
    // (Quedan sin usar agenda-movil y cierre-movil, por si más adelante se quiere rotar pantallas.)
    imagenes: ['/capturas/asistente-movil-claro.webp', '/capturas/asistente-movil-oscuro.webp'],
    alt: 'MediCuenta en el celular del médico, en tema claro y oscuro',
    rotulo: '[Captura: app en el celular]',
    caption: 'En tu celular, de día y de noche: pedile lo que necesites por voz o por texto',
  },
  {
    id: 'agenda',
    marco: 'navegador' as const,
    imagenes: ['/capturas/agenda-claro.webp', '/capturas/agenda-oscuro.webp'],
    alt: 'Agenda del día con sala de espera, turnos y sobreturnos',
    rotulo: '[Captura: agenda]',
    caption: 'La agenda del día: quién está en sala, quién pagó y quién falta',
  },
  {
    id: 'reportes',
    marco: 'navegador' as const,
    imagenes: [
      '/capturas/reportes-claro.webp',
      '/capturas/reportes-graficos.webp',
      '/capturas/reportes-tabla.webp',
    ],
    alt: 'Reportes: facturación, cobros, débitos y comparativa de los últimos 12 meses',
    rotulo: '[Captura: reportes]',
    caption: 'Cuánto facturaste, cuánto te pagaron y qué te debitaron',
  },
]

export function Demo() {
  return (
    <section aria-labelledby="demo-titulo" className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-primary">Demo</p>
          <h2 id="demo-titulo" className="mt-2 text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Mirá la app funcionando
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted-foreground">
            Capturas reales del asistente, la agenda y los reportes — sin maquetas infladas.
          </p>
        </Reveal>

        <div className="mt-12 grid items-start gap-6 md:grid-cols-3">
          {PANTALLAS.map((p, i) => (
            <Reveal key={p.id} delayMs={i * 120}>
              <figure className="flex h-full flex-col items-center gap-4">
                <Captura
                  imagenes={p.imagenes}
                  alt={p.alt}
                  marco={p.marco}
                  rotulo={p.rotulo}
                  retrasoMs={i * 900}
                  prioridad={i === 0}
                />
                <figcaption className="text-balance text-center text-xs leading-relaxed text-muted-foreground">
                  {p.caption}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
