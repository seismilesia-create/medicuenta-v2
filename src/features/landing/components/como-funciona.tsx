import { CalendarCheck2, Camera, FileSpreadsheet } from 'lucide-react'
import { Reveal } from './reveal'

/** Sección "el problema" (empatía) + los 3 pasos de cómo funciona. */

const DOLORES = [
  {
    titulo: 'Una planilla distinta por obra social',
    detalle: 'Cada OS con sus códigos, sus valores del mes y su formato. Todo a mano.',
  },
  {
    titulo: 'La presentación de cada mes',
    detalle: 'Ordenar pilas de órdenes, tipear, imprimir por duplicado y llevarla física.',
  },
  {
    titulo: 'Débitos que descubrís tarde',
    detalle: 'Te enterás al cobrar la liquidación — cuando ya no se puede reclamar.',
  },
]

const PASOS = [
  {
    icono: Camera,
    titulo: 'Sacale una foto a la orden',
    detalle:
      'La app la lee y la carga sola: paciente, obra social, fecha y código. Vos solo confirmás.',
  },
  {
    icono: CalendarCheck2,
    titulo: 'El asistente atiende tu WhatsApp',
    detalle:
      'Da turnos según tu agenda real, entrega recetas y cobra por MercadoPago. Las 24 horas, con tus reglas.',
  },
  {
    icono: FileSpreadsheet,
    titulo: 'La presentación se arma sola',
    detalle:
      'MediCuenta genera la planilla de cada obra social lista para presentar, y controlás los débitos desde los reportes.',
  },
]

export function ComoFunciona() {
  return (
    <>
      {/* El problema */}
      <section aria-labelledby="problema-titulo" className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <Reveal>
            <h2 id="problema-titulo" className="text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Hoy, facturar te roba horas de consultorio
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {DOLORES.map((d, i) => (
              <Reveal key={d.titulo} delayMs={i * 100}>
                <div className="h-full rounded-2xl border border-border bg-card p-5">
                  <p className="font-semibold">{d.titulo}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d.detalle}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" aria-labelledby="pasos-titulo" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
          <Reveal>
            <p className="text-center text-sm font-semibold uppercase tracking-wider text-primary">
              Cómo funciona
            </p>
            <h2 id="pasos-titulo" className="mt-2 text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Tres pasos, cero papeles
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PASOS.map((p, i) => (
              <Reveal key={p.titulo} delayMs={i * 120}>
                <div className="relative h-full rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-primary-900/5">
                  <span
                    aria-hidden="true"
                    className="absolute right-5 top-4 text-5xl font-bold leading-none text-primary-100 dark:text-primary-900/60"
                  >
                    {i + 1}
                  </span>
                  <div className="gradient-medical grid h-12 w-12 place-items-center rounded-xl text-white shadow-md shadow-primary/20">
                    <p.icono className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{p.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.detalle}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
