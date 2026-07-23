import { BotonSolicitarAcceso } from './cta-whatsapp'
import { Reveal } from './reveal'

/** FAQ en acordeón nativo (details/summary, accesible sin JS) + CTA final. */

const PREGUNTAS = [
  {
    q: '¿Cuánto cuesta?',
    a: 'Durante el lanzamiento el acceso es por invitación y las condiciones se conversan directamente con vos. Escribinos por WhatsApp y lo vemos juntos.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. Cada médico ve únicamente su propia información: pacientes, órdenes y números están separados por profesional. Podés sumar a tu secretaria con permisos limitados, y tus datos no se comparten con nadie.',
  },
  {
    q: '¿Funciona con mi obra social?',
    a: 'MediCuenta trabaja con las obras sociales que se facturan en Catamarca — OSEP, PAMI y el resto del catálogo local — con los valores vigentes de cada período. Si facturás alguna particular, contanos y la revisamos.',
  },
  {
    q: '¿Necesito saber de tecnología?',
    a: 'No. El asistente funciona sobre WhatsApp, que ya usás todos los días, y la app está pensada para cargar una orden con una foto. Además te acompañamos en la puesta en marcha.',
  },
  {
    q: '¿En qué dispositivos anda?',
    a: 'En el celular y en la computadora, desde el navegador, sin instalar nada. Si querés, también se puede agregar a la pantalla de inicio del teléfono como una app.',
  },
]

export function Faq() {
  return (
    <>
      <section aria-labelledby="faq-titulo">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:py-24">
          <Reveal>
            <p className="text-center text-sm font-semibold uppercase tracking-wider text-primary">
              Preguntas frecuentes
            </p>
            <h2 id="faq-titulo" className="mt-2 text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Lo que los médicos nos preguntan primero
            </h2>
          </Reveal>

          <Reveal className="mt-10">
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {PREGUNTAS.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 shrink-0 fill-none stroke-muted-foreground stroke-2 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA final */}
      <section aria-labelledby="cta-final-titulo" className="px-5 pb-20 sm:px-8 lg:pb-24">
        <Reveal>
          <div className="gradient-medical relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 text-center text-white sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(255,255,255,0.18),transparent_60%)]"
            />
            <h2 id="cta-final-titulo" className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
              Sumate a los primeros médicos de Catamarca
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/85 sm:text-base">
              Contanos tu especialidad y cómo facturás hoy. Te mostramos MediCuenta andando y, si te
              cierra, te mandamos tu enlace de invitación.
            </p>
            <div className="mt-7 flex justify-center">
              <BotonSolicitarAcceso variante="invertido" />
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
