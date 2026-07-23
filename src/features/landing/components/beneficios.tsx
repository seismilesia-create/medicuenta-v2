import {
  BarChart3,
  Bot,
  CalendarDays,
  FileSpreadsheet,
  HeartHandshake,
  Lock,
  MapPin,
  Pill,
  ScanLine,
  Stethoscope,
} from 'lucide-react'
import { Reveal } from './reveal'

/** Bento de beneficios + bloque de confianza ("por qué confiar"). */

const BENEFICIOS = [
  {
    icono: FileSpreadsheet,
    titulo: 'Facturación a obras sociales, automatizada',
    detalle:
      'La planilla de cada OS se arma sola con tus órdenes cargadas: códigos, valores del período y formato listo para presentar.',
    destacado: true,
  },
  {
    icono: Bot,
    titulo: 'Asistente de IA 24/7 en WhatsApp',
    detalle:
      'Atiende a tus pacientes con tus reglas: turnos, recetas, cobros y avisos — también cuando el consultorio está cerrado.',
    destacado: true,
  },
  {
    icono: ScanLine,
    titulo: 'Órdenes y recetas con una foto',
    detalle: 'OCR que lee el papel y completa los datos. Confirmás y listo.',
    destacado: false,
  },
  {
    icono: CalendarDays,
    titulo: 'Agenda inteligente',
    detalle: 'Horarios, días particulares, feriados y obras sociales suspendidas, en un solo lugar.',
    destacado: false,
  },
  {
    icono: BarChart3,
    titulo: 'Reportes y control de débitos',
    detalle: 'Sabé cuánto facturaste, cuánto te pagaron y qué te debitaron — a tiempo para reclamar.',
    destacado: false,
  },
  {
    icono: Pill,
    titulo: 'Recetas por WhatsApp',
    detalle: 'El paciente la pide, paga por MercadoPago y la recibe en PDF. Sin llamados al consultorio.',
    destacado: false,
  },
]

const CONFIANZA = [
  {
    icono: MapPin,
    titulo: 'Hecho en Catamarca',
    detalle: 'Entiende las obras sociales de acá — OSEP, PAMI y las demás — con sus valores y sus reglas.',
  },
  {
    icono: Stethoscope,
    titulo: 'Creado desde adentro',
    detalle: 'Nace del sistema de salud catamarqueño, del dolor real de facturar todos los meses.',
  },
  {
    icono: Lock,
    titulo: 'Tus datos son tuyos',
    detalle: 'Cada médico ve solo lo suyo. Multiusuario seguro, con tu secretaria si querés.',
  },
  {
    icono: HeartHandshake,
    titulo: 'Sin vueltas técnicas',
    detalle: 'Funciona sobre el WhatsApp que ya usás. Si sabés mandar un mensaje, sabés usar MediCuenta.',
  },
]

export function Beneficios() {
  return (
    <>
      <section aria-labelledby="beneficios-titulo">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
          <Reveal>
            <p className="text-center text-sm font-semibold uppercase tracking-wider text-primary">
              Todo en uno
            </p>
            <h2 id="beneficios-titulo" className="mt-2 text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Lo que MediCuenta hace por tu consultorio
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFICIOS.map((b, i) => (
              <Reveal key={b.titulo} delayMs={i * 80} className={b.destacado ? 'sm:col-span-2 lg:col-span-1 lg:row-span-1' : ''}>
                <div
                  className={`h-full rounded-2xl border p-6 transition-shadow hover:shadow-lg hover:shadow-primary-900/5 ${
                    b.destacado
                      ? 'border-primary-200 bg-primary-50/60 dark:border-primary-800 dark:bg-primary-900/20'
                      : 'border-border bg-card'
                  }`}
                >
                  <div
                    className={`grid h-11 w-11 place-items-center rounded-xl ${
                      b.destacado
                        ? 'gradient-medical text-white shadow-md shadow-primary/20'
                        : 'bg-accent text-accent-foreground'
                    }`}
                  >
                    <b.icono className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-semibold">{b.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{b.detalle}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Por qué confiar */}
      <section aria-labelledby="confianza-titulo" className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <Reveal>
            <h2 id="confianza-titulo" className="text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Pensado para médicos, no para técnicos
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONFIANZA.map((c, i) => (
              <Reveal key={c.titulo} delayMs={i * 80}>
                <div className="h-full rounded-2xl border border-border bg-card p-5 text-center">
                  <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary dark:bg-primary-900/40">
                    <c.icono className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mt-3 font-semibold">{c.titulo}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.detalle}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
