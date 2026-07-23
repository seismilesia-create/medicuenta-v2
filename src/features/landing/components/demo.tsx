import { ImageIcon, MonitorSmartphone, Smartphone } from 'lucide-react'
import { Reveal } from './reveal'

/**
 * Demo visual con HUECOS ROTULADOS para pegar capturas reales de la app
 * (guardrail del spec: no inventar capturas). Cuando estén las imágenes,
 * cada placeholder se reemplaza por un <Image> dentro del mismo marco.
 */

const CAPTURAS = [
  {
    id: 'demo-chat',
    marco: 'phone' as const,
    icono: Smartphone,
    rotulo: '[Captura: chat del agente]',
    caption: 'El asistente dando un turno real por WhatsApp',
  },
  {
    id: 'demo-agenda',
    marco: 'browser' as const,
    icono: MonitorSmartphone,
    rotulo: '[Captura: agenda]',
    caption: 'Tu agenda con turnos, días particulares y excepciones',
  },
  {
    id: 'demo-reportes',
    marco: 'browser' as const,
    icono: MonitorSmartphone,
    rotulo: '[Captura: reportes]',
    caption: 'Reportes de facturación y control de débitos',
  },
]

function MarcoPlaceholder({
  marco,
  icono: Icono,
  rotulo,
}: {
  marco: 'phone' | 'browser'
  icono: typeof Smartphone
  rotulo: string
}) {
  return (
    <div
      className={`grid w-full place-items-center rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-900/20 ${
        marco === 'phone' ? 'aspect-[9/16] max-w-[220px]' : 'aspect-video'
      }`}
    >
      <div className="px-4 text-center">
        <Icono className="mx-auto h-8 w-8 text-primary-300 dark:text-primary-700" aria-hidden="true" />
        <p className="mt-2 font-mono text-xs font-medium text-primary-600 dark:text-primary-400">{rotulo}</p>
      </div>
    </div>
  )
}

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

        <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
          {CAPTURAS.map((c, i) => (
            <Reveal key={c.id} delayMs={i * 120}>
              <figure className="flex h-full flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5">
                <MarcoPlaceholder marco={c.marco} icono={c.icono} rotulo={c.rotulo} />
                <figcaption className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {c.caption}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
