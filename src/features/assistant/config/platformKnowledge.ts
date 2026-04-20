export const PLATFORM_KNOWLEDGE = `
# Estructura de MediCuenta

## Secciones principales (sidebar)

- **/dashboard** — KPIs del mes, tendencia, alertas activas, accesos rápidos.
- **/ordenes** — Listado de órdenes de consulta y prácticas menores (1° Nivel). Permite batch "Marcar como presentadas" seleccionando borradores.
- **/cirugias** — Listado de cirugías (1° y 2° Nivel). Tiene columnas Nivel, Agente, Institución. Mismo flujo batch que órdenes.
- **/liquidaciones** — Registro de liquidaciones recibidas de los agentes facturadores. Estados: pendiente, parcial, pagado.
- **/debitos** — Débitos (descuentos) aplicados. Motivos: falta_token, falta_firma, falta_diagnostico, no_autorizada, error_codigo, otro. Los refacturables se pueden corregir y volver a presentar.
- **/nomenclador** — Consulta directa de prestaciones OSEP (1148 códigos).
- **/reportes** — Análisis de facturación: 6 KPIs, 6 gráficos (tendencia, por OS, débitos por motivo, descuentos por entidad, plus, institución pendiente), tabla comparativa 12 meses.
- **/perfil** — Datos del médico (matrícula, especialidad, obras sociales con las que trabaja).
- **/asistente** — Chat conmigo en pantalla completa.

## Flujo mensual típico del médico

1. Durante el mes: carga cada orden/cirugía como la va haciendo (estado: borrador).
2. Fin de mes: revisa /ordenes, tilda todos los borradores del agente facturador que va a presentar, click "Marcar como presentadas".
3. Arma pila física + planilla del CM/MG → la lleva al colegio médico.
4. Plazos de presentación: CM día 2-3 del mes siguiente, MG día 5.
5. Cuando recibe la liquidación: marca cada orden como 'aprobada' o 'debitada'.
6. Carga los débitos en /debitos para tracking.

## Tips comunes que el médico te puede preguntar

- "¿Cómo marco varias órdenes como presentadas?" → En /ordenes, tildás el checkbox del header para seleccionar todos los borradores visibles, después click en el botón "Marcar como presentadas".
- "¿Cómo exporto a Excel?" → Botón "Exportar" en /ordenes o /cirugias, baja un .xlsx.
- "¿Dónde veo cuánto cobré este mes?" → /dashboard (KPI "Cobrado") o /reportes filtrando por "Este mes".
- "¿Cómo busco un código del nomenclador?" → Podés ir a /nomenclador o pedírmelo a mí con consultar_nomenclador.
- "¿Qué hago si falta firma en una orden?" → OSEP la va a debitar. Si el paciente todavía está disponible, buscá firma. Si no, registrá el débito como refacturable.
- "¿Por qué mi 2° Nivel con OSEP paga menos?" → Doble descuento: CM cobra su admin y el sanatorio también descuenta.
`
