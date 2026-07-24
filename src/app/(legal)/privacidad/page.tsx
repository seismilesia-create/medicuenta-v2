import type { Metadata } from 'next'
import { Destacado, Lista, Seccion, TituloLegal } from '@/features/landing/components/prosa-legal'
import { WA_SOLICITAR_ACCESO } from '@/features/landing/constants'

export const metadata: Metadata = {
  title: 'Política de privacidad — MediCuenta',
  description:
    'Qué datos trata MediCuenta, para qué, con quién se comparten y cómo ejercer tus derechos.',
}

export default function PrivacidadPage() {
  return (
    <>
      <TituloLegal titulo="Política de privacidad" actualizado="23 de julio de 2026" />

      <Seccion titulo="En resumen">
        <Destacado>
          Los datos de tus pacientes son tuyos, no nuestros. Cada profesional ve únicamente la
          información de su propio consultorio. No vendemos datos, no los usamos para publicidad y
          no los compartimos con otros profesionales.
        </Destacado>
      </Seccion>

      <Seccion titulo="1. Quién trata los datos y en qué rol">
        <p>
          Cuando se trata de los datos de tus pacientes, el responsable sos vos: sos quien tiene la
          relación profesional con ellos y quien decide qué se carga. MediCuenta actúa como
          proveedor que trata esos datos por tu cuenta y siguiendo tus instrucciones, para prestarte
          el servicio.
        </p>
        <p>
          De los datos de tu propia cuenta (los que nos das para registrarte y usar la app) somos
          responsables nosotros.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué datos tratamos">
        <p>
          <strong className="text-foreground">De vos, profesional:</strong>
        </p>
        <Lista
          items={[
            'Nombre, apellido, matrícula, especialidad, CUIT, correo electrónico y teléfono.',
            'Datos de configuración de tu consultorio: horarios, lugares de atención, obras sociales y precios.',
            'Información técnica de uso necesaria para operar y depurar el servicio.',
          ]}
        />
        <p className="pt-1">
          <strong className="text-foreground">De tus pacientes:</strong>
        </p>
        <Lista
          items={[
            'Nombre, apellido, DNI, teléfono y obra social.',
            'Turnos, motivo breve de consulta, y las conversaciones de WhatsApp con el asistente.',
            'Órdenes de consulta y recetas que cargás, incluidas las imágenes o PDF y los datos que se extraen de ellos.',
            'Registros de cobros (concepto, monto y medio de pago).',
          ]}
        />
        <p className="pt-1">
          Parte de esta información constituye <strong className="text-foreground">datos de salud</strong>, que
          la Ley 25.326 de Protección de los Datos Personales considera datos sensibles. Los tratamos
          con esa consideración: acceso restringido, cifrado en tránsito y aislamiento por
          consultorio.
        </p>
      </Seccion>

      <Seccion titulo="3. Para qué los usamos">
        <Lista
          items={[
            'Prestar el servicio: agenda, asistente de WhatsApp, carga de órdenes y recetas, cobros y presentaciones a obras sociales.',
            'Sostener y mejorar el funcionamiento de la app, y darte soporte cuando lo pedís.',
            'Cumplir obligaciones legales, cuando corresponda.',
          ]}
        />
        <p>
          No usamos los datos de tus pacientes para publicidad, ni los cedemos a terceros con fines
          comerciales, ni entrenamos modelos de inteligencia artificial con ellos.
        </p>
      </Seccion>

      <Seccion titulo="4. Con quién se comparten">
        <p>
          Para funcionar, el servicio se apoya en proveedores que tratan datos por nuestra cuenta,
          con obligaciones de confidencialidad:
        </p>
        <Lista
          items={[
            <>
              <strong className="text-foreground">Supabase</strong> — base de datos y archivos (órdenes,
              recetas).
            </>,
            <>
              <strong className="text-foreground">Vercel</strong> — alojamiento de la aplicación.
            </>,
            <>
              <strong className="text-foreground">WhatsApp (Meta)</strong> — envío y recepción de los
              mensajes con tus pacientes.
            </>,
            <>
              <strong className="text-foreground">MercadoPago</strong> — procesamiento de los pagos, con
              tu propia cuenta conectada.
            </>,
            <>
              <strong className="text-foreground">Proveedores de inteligencia artificial</strong> —
              procesan el texto de las conversaciones y las imágenes de las órdenes para generar las
              respuestas del asistente y extraer los datos. Se usan modalidades sin retención de datos
              para entrenamiento.
            </>,
          ]}
        />
        <p>
          Algunos de estos proveedores están fuera de la Argentina, por lo que puede haber
          transferencia internacional de datos, sujeta a las garantías contractuales de cada uno.
        </p>
      </Seccion>

      <Seccion titulo="5. Cómo los protegemos">
        <Lista
          items={[
            'Aislamiento por consultorio: la base de datos aplica reglas que impiden que un profesional acceda a información de otro.',
            'Acceso por roles: tu secretaria ve la agenda, las conversaciones y los pacientes, nunca tu facturación ni tus recetas.',
            'Comunicaciones cifradas y credenciales de terceros almacenadas cifradas.',
            'Los archivos de recetas y órdenes se guardan en almacenamiento privado, no accesible públicamente.',
          ]}
        />
      </Seccion>

      <Seccion titulo="6. Cuánto tiempo los conservamos">
        <p>
          Conservamos la información mientras tu cuenta esté activa, y luego durante el plazo que
          exijan las normas contables, fiscales y sanitarias aplicables a la documentación de
          respaldo. Cumplido ese plazo, se eliminan o se anonimizan.
        </p>
      </Seccion>

      <Seccion titulo="7. Tus derechos">
        <p>
          Podés solicitar el acceso, la rectificación, la actualización o la supresión de tus datos
          personales escribiéndonos por WhatsApp. Vamos a responderte en los plazos que fija la Ley
          25.326.
        </p>
        <p>
          La <strong className="text-foreground">Agencia de Acceso a la Información Pública</strong>, órgano
          de control de la Ley 25.326, atiende las denuncias y reclamos de quienes vean afectado su
          derecho a la protección de sus datos personales.
        </p>
      </Seccion>

      <Seccion titulo="8. Tus pacientes">
        <p>
          Como responsable de esos datos, sos vos quien debe informar a tus pacientes que usás una
          herramienta digital para gestionar sus turnos, recetas y cobros, y contar con su
          consentimiento para comunicarte con ellos por WhatsApp. Si un paciente tuyo quiere ejercer
          sus derechos, escribinos y te ayudamos a resolverlo.
        </p>
      </Seccion>

      <Seccion titulo="9. Cambios y contacto">
        <p>
          Si actualizamos esta política, publicamos la nueva versión en esta página con su fecha.
          Para cualquier consulta sobre el tratamiento de datos, escribinos por{' '}
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
