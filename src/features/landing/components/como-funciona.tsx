import { CalendarCheck2, Camera, FileSpreadsheet } from 'lucide-react'
import { Captura } from './captura'
import { Reveal } from './reveal'

/** Sección "el problema" (empatía) + los 3 pasos de cómo funciona, cada uno con la
 *  pantalla real que le corresponde (en zigzag, para que el scroll no sea una lista). */

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
    imagenes: ['/capturas/ordenes-claro.webp'],
    alt: 'Listado de órdenes cargadas, con las que todavía no tienen foto',
    rotulo: '[Captura: órdenes]',
  },
  {
    icono: CalendarCheck2,
    titulo: 'El asistente atiende tu WhatsApp',
    detalle:
      'Da turnos según tu agenda real, entrega recetas y cobra por MercadoPago. Las 24 horas, con tus reglas.',
    imagenes: ['/capturas/conversaciones-claro.webp', '/capturas/conversaciones-oscuro.webp'],
    alt: 'Bandeja de conversaciones de WhatsApp con los pacientes',
    rotulo: '[Captura: conversaciones]',
  },
  {
    icono: FileSpreadsheet,
    titulo: 'La presentación se arma sola',
    detalle:
      'MediCuenta genera la planilla de cada obra social lista para presentar, y controlás los débitos desde los reportes.',
    imagenes: ['/capturas/cierre-claro.webp'],
    alt: 'Rendición del día con las órdenes por obra social y la caja',
    rotulo: '[Captura: cierre del día]',
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

          {/* Zigzag: el texto y la pantalla cambian de lado en cada paso. */}
          <div className="mt-14 space-y-16 lg:space-y-24">
            {PASOS.map((p, i) => (
              <Reveal key={p.titulo}>
                <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                  <div className={i % 2 === 1 ? 'lg:order-2' : undefined}>
                    <div className="flex items-center gap-3">
                      <div className="gradient-medical grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-md shadow-primary/20">
                        <p.icono className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <span
                        aria-hidden="true"
                        className="text-5xl font-bold leading-none text-primary-100 dark:text-primary-900/60"
                      >
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight">{p.titulo}</h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{p.detalle}</p>
                  </div>
                  <div className={i % 2 === 1 ? 'lg:order-1' : undefined}>
                    <Captura
                      imagenes={p.imagenes}
                      alt={p.alt}
                      marco="navegador"
                      rotulo={p.rotulo}
                      retrasoMs={i * 700}
                    />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
