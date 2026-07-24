import type { Metadata } from 'next'
import { Destacado, Lista, Seccion, TituloLegal } from '@/features/landing/components/prosa-legal'
import { WA_SOLICITAR_ACCESO } from '@/features/landing/constants'

export const metadata: Metadata = {
  title: 'Términos y condiciones — MediCuenta',
  description: 'Condiciones de uso del servicio MediCuenta para profesionales de la salud.',
}

export default function TerminosPage() {
  return (
    <>
      <TituloLegal titulo="Términos y condiciones" actualizado="23 de julio de 2026" />

      <Seccion titulo="1. Qué es MediCuenta">
        <p>
          MediCuenta es un servicio digital que ayuda a profesionales de la salud a organizar su
          consultorio: agenda de turnos, carga de órdenes y recetas a partir de una foto, cobros,
          armado de las presentaciones a obras sociales, y un asistente que atiende WhatsApp en
          nombre del profesional.
        </p>
        <p>
          Al crear una cuenta y usar el servicio, aceptás estas condiciones. Si no estás de acuerdo,
          no uses MediCuenta.
        </p>
      </Seccion>

      <Seccion titulo="2. Quién puede usarlo">
        <Lista
          items={[
            'Profesionales de la salud matriculados, y las personas que ellos autoricen (por ejemplo, su secretaria).',
            'Durante la etapa de lanzamiento el acceso es por invitación: se entrega un enlace personal y no es transferible.',
            'Sos responsable de la seguridad de tu cuenta y de lo que se haga desde ella. Avisanos si sospechás que alguien más tiene acceso.',
          ]}
        />
      </Seccion>

      <Seccion titulo="3. Tu responsabilidad profesional">
        <Destacado>
          MediCuenta es una herramienta administrativa. No practica medicina, no diagnostica y no
          reemplaza tu criterio profesional. Todas las decisiones clínicas y la relación con tus
          pacientes siguen siendo exclusivamente tuyas.
        </Destacado>
        <p>Al usar el servicio te comprometés a:</p>
        <Lista
          items={[
            'Cargar información veraz y usar el servicio conforme a las normas de tu profesión y a la legislación vigente.',
            'Ser responsable del contenido de las órdenes, recetas y presentaciones que emitís, y de revisarlas antes de presentarlas.',
            'Contar con el consentimiento de tus pacientes para el tratamiento de sus datos, y para comunicarte con ellos por WhatsApp.',
            'No usar el servicio para fines ilícitos ni para enviar comunicaciones no solicitadas.',
          ]}
        />
      </Seccion>

      <Seccion titulo="4. El asistente automático">
        <p>
          El asistente responde a tus pacientes por WhatsApp con las reglas que vos configurás
          (horarios, lugares de atención, obras sociales, precios). Está expresamente limitado para
          no dar contenido clínico: no diagnostica, no recomienda medicamentos ni indica dosis. Ante
          una posible urgencia, deriva a los servicios de emergencia.
        </p>
        <p>
          Podés pausarlo y responder vos en cualquier momento. Como toda tecnología basada en
          modelos de lenguaje, puede cometer errores: revisá la información importante y avisanos si
          detectás algo raro.
        </p>
      </Seccion>

      <Seccion titulo="5. Cobros a pacientes">
        <p>
          Los pagos de tus pacientes se procesan a través de MercadoPago, con tu propia cuenta
          conectada. El dinero va directamente a esa cuenta: MediCuenta no lo recibe, no lo retiene
          ni lo administra. Las condiciones, comisiones y plazos de acreditación son los de
          MercadoPago.
        </p>
      </Seccion>

      <Seccion titulo="6. Disponibilidad del servicio">
        <p>
          Trabajamos para que MediCuenta esté disponible de forma continua, pero no podemos
          garantizar un funcionamiento ininterrumpido: pueden ocurrir interrupciones por
          mantenimiento, fallas de terceros (WhatsApp, MercadoPago, proveedores de infraestructura)
          o causas fuera de nuestro control. Podemos modificar o discontinuar funcionalidades,
          avisando con anticipación razonable cuando el cambio sea significativo.
        </p>
      </Seccion>

      <Seccion titulo="7. Precio">
        <p>
          Durante la etapa de lanzamiento el acceso es sin costo para los profesionales invitados.
          Cuando se establezca un precio, te lo vamos a informar con anticipación y vas a poder
          decidir si continuás. Ningún cambio de precio se aplica de forma retroactiva.
        </p>
      </Seccion>

      <Seccion titulo="8. Tus datos, y cómo llevártelos">
        <p>
          La información que cargás es tuya. Podés pedir una copia de tus datos o la baja de tu
          cuenta cuando quieras, escribiéndonos por WhatsApp. Al darte de baja eliminamos tu
          información según lo descrito en la{' '}
          <a href="/privacidad" className="font-medium text-primary hover:underline">
            política de privacidad
          </a>
          .
        </p>
      </Seccion>

      <Seccion titulo="9. Límite de responsabilidad">
        <p>
          MediCuenta se ofrece tal como está. En la medida en que lo permita la ley, no respondemos
          por lucro cesante ni por daños indirectos derivados del uso del servicio. Nada de lo aquí
          dicho limita tu responsabilidad profesional ni las obligaciones que la ley nos impone.
        </p>
      </Seccion>

      <Seccion titulo="10. Cambios en estas condiciones">
        <p>
          Si actualizamos estos términos, publicamos la nueva versión en esta página con su fecha.
          Cuando el cambio sea relevante, te avisamos por los canales de contacto que tengamos.
        </p>
      </Seccion>

      <Seccion titulo="11. Ley aplicable y contacto">
        <p>
          Estas condiciones se rigen por las leyes de la República Argentina. Ante cualquier
          controversia se aplicará la jurisdicción de los tribunales ordinarios de la Provincia de
          Catamarca.
        </p>
        <p>
          Para cualquier consulta sobre estos términos, escribinos por{' '}
          <a
            href={WA_SOLICITAR_ACCESO}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            WhatsApp
          </a>
          .
        </p>
      </Seccion>
    </>
  )
}
