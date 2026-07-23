import { BotonSolicitarAcceso } from './cta-whatsapp'
import { PhoneMockup } from './phone-mockup'
import { Reveal } from './reveal'

export function Hero() {
  return (
    <section aria-labelledby="hero-titulo" className="relative overflow-hidden">
      {/* Fondo suave de marca */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,oklch(from_var(--color-primary)_l_c_h_/_0.08),transparent_70%)]"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:pb-28 lg:pt-20">
        <Reveal>
          <div className="text-center lg:text-left">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3.5 py-1.5 text-xs font-medium text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
              <span aria-hidden="true">🩺</span> Para médicos que facturan a obras sociales
            </p>

            <h1 id="hero-titulo" className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Dejá de facturar a mano.{' '}
              <span className="text-gradient-medical">MediCuenta agenda, cobra y presenta por vos.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
              Un asistente con IA atiende tu WhatsApp las 24 horas: da turnos, entrega recetas y
              cobra. Vos sacás una foto de la orden, y la presentación de cada obra social se arma
              sola — sin planillas, sin papeles, sin débitos sorpresa.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <BotonSolicitarAcceso />
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-7 py-3.5 text-base font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Ver cómo funciona
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </a>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Acceso por invitación durante el lanzamiento · Sin tarjeta
            </p>
          </div>
        </Reveal>

        <Reveal delayMs={150} className="justify-self-center lg:justify-self-end">
          <div className="lg:rotate-2 lg:transition-transform lg:duration-500 lg:hover:rotate-0">
            <PhoneMockup />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
