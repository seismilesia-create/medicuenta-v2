# Spec (BORRADOR) — Dashboard del dueño: superadmin + orquestador — MediCuenta

> Estado: **borrador de brainstorm** (2026-06-12). Captura la visión de Héctor para
> refinar antes de planear la construcción. Origen: §12 del spec de Fase 3
> (`2026-06-11-fase3-panel-consultorio-design.md`).

## 1. Contexto y visión

MediCuenta pasa de ser "la app del médico" a tener también **la consola del dueño de la
plataforma** (Héctor). Son dos mitades, capturadas de sus palabras en §12:

- **🛠 Superadmin (negocio):** alta/baja de suscripciones de médicos, métricas del negocio,
  gestión de los tenants (médicos) y de los números de WhatsApp (que provee y cobra Héctor).
- **🤖 Orquestador (agente vigía):** vive adentro, anda 24/7, mira que todo funcione, y
  reporta problemas. (Runtime a definir: servidor 24/7 / LLM local / API de un modelo capaz.)

**Lo que la Fase 3 ya dejó listo:** `wa_bitacora` (la traza estructurada del agente) = **los
ojos del orquestador**. Primer ladrillo ya puesto.

## 2. Decisiones del dueño (2026-06-12)

| ID | Decisión | Detalle / razón |
|---|---|---|
| **DD1** | **Cobranza: MercadoPago Suscripciones** | Cobro recurrente automático. Nativo de Argentina; reusa la integración MP que ya existe para recetas. |
| **DD2** | **Dos planes** | **Básico = facturación** (órdenes, liquidaciones, débitos, cirugías, nomenclador, reportes). **Full = facturación + receta electrónica con cobro del asistente + agenda de turnos por WhatsApp** (todo el ecosistema del asistente, incluida la secretaria 3B). |
| **DD3** | **Full crece a futuro** | El plan Full sumará la **parte financiera/contable + consejos de inversión** (el "asistente financiero" de la visión: informar, NUNCA asesorar — regulado por CNV). |
| **DD4** | **Prueba gratis: 15 días** | Baja la barrera de adopción. |
| **DD5** | **Orquestador v1: observa y avisa, NO actúa solo** | Máxima seguridad mientras se le agarra confianza. Autonomía configurable = futuro. |
| **DD6** | **Avisos por WhatsApp + Email** | WhatsApp al número de Héctor (inmediato) + email (informes/registro). |
| **DD7** | **Precios (rango, a afinar con costos)** | Básico **US$ 25–30**, Full **US$ 55–65**. Se cerrarán una vez calculados los costos (sobre todo IA, ver §5.1) para armar una **promo/oferta** con piso conocido. |
| **DD8** | **Número de prueba = SANDBOX/DEMO (no pacientes reales)** | Un único número compartido para todos los médicos en prueba. El médico **se prueba a sí mismo**: manda PDFs de receta de muestra desde su WhatsApp, juega de paciente (flujo de cobro de receta) y **agenda un turno de prueba**. Como escribe desde su propio teléfono, el número **desambigua por el teléfono del médico** (sender = médico registrado → su workspace demo). Resuelve el problema del número compartido. |
| **DD9** | **Dashboard de prueba (sandbox) para el médico** | Durante la prueba, el médico ve un panel demo donde queda asentado el **turno de prueba** que agendó, y la **conversación con sus colores de estado** (en curso · pidió atención humana · finalizada). Reusa el panel de consultorio existente (agenda + conversaciones con semáforo) en modo demo. |

## 3. Consecuencia técnica central: candado de funciones por plan (feature-gating)

Hoy **todos los médicos ven todo** — no hay gating. Con DD2, el plan Básico NO debe acceder al
asistente/agenda/recetas. Se necesita:
- Una **fuente de verdad del plan** del médico (tabla de suscripciones / `perfiles.plan`).
- **Enforcement en 3 capas** (como el guard de rol de 3B): ocultar en el menú · redirigir en el
  middleware · y chequeo server-side (acciones/RLS) para que no se acceda por API.
- Mapa de gating (**confirmado 2026-06-12**):
  - **Básico:** Dashboard, Órdenes, Liquidaciones, Débitos, Cirugías, Nomenclador, Reportes **+ el
    asistente IA de facturación** (el chat que ayuda a cargar órdenes — SÍ va en Básico).
  - **Full:** lo anterior **+** Agenda, Conversaciones, Pacientes, Asistente de turnos (config),
    el asistente de WhatsApp (turnos/recetas/cobros) y la secretaria.
  - **Nota de costo:** el asistente de facturación (Básico) y el de WhatsApp (Full) ambos gastan
    tokens de IA → el costo de IA aplica a los DOS planes (ver métricas §5.1).

## 4. Modelo de datos (nuevo — greenfield)

| Tabla/Campo | Para qué |
|---|---|
| **rol `superadmin`** (Héctor) | Ve a TODOS los médicos. Hoy NO existe (la app es por-médico). Se agrega a `perfiles.rol` o como flag. |
| **`suscripciones`** | `medico_id`, `plan` (basico\|full), `estado` (prueba\|activa\|morosa\|suspendida\|baja), `trial_ends_at`, `mp_subscription_id`, `current_period_end`, `created_at`. |
| **número WhatsApp** | Ya vive en `wa_canales` (provisto por Héctor). El panel lo lista/asigna; no se rehace. |

**Acceso cross-tenant del superadmin:** la RLS es por `medico_id`. El superadmin lee TODO vía
**service-role en server actions** con guard de rol estricto (mismo patrón que 3B para canales).

## 5. Alcance del Superadmin (qué pantallas)

1. **Médicos (tenants):** lista con estado de suscripción, plan, número WhatsApp asignado, estado
   de onboarding, fecha de alta. Alta/baja/suspensión.
2. **Suscripciones:** plan, estado de pago (MP), vencimientos, prueba; dar de alta/baja.
3. **Métricas del negocio:** # médicos por plan/estado, **MRR** (ingreso recurrente), altas/bajas
   (churn), crecimiento.
4. **Salud del sistema (semilla del orquestador):** errores agregados de `wa_bitacora` de TODOS los
   médicos, alertas (sync caída, token Meta vencido, pago fallido).

### 5.1 Métricas de COSTO (PRIORITARIAS — definidas por el dueño 2026-06-12)

Son las primeras que se construyen, porque **impactan directo en el costo de Héctor** y en el piso
de precio para la promo (DD7):

- **Tokens de IA por médico + promedio.** Cuántos tokens gasta el/los asistente(s) de cada médico
  (el de facturación y, en Full, el de WhatsApp). Mostrar el **promedio** y **destacar los médicos
  que se van por encima** (outliers que cuestan más de lo normal). Es el costo de IA, el principal.
  - *Implementación:* `generateText`/`generateObject` del AI SDK devuelven `usage` (input/output
    tokens). Hoy NO se registra. Se captura por turno (extensión natural del resumen de bitácora,
    `wa_bitacora.detalle`, o una tabla de uso agregada por médico/mes).
- **Mensajes de WhatsApp y, sobre todo, los QUE TIENEN COSTO (fuera de la ventana de 24 h).** Meta
  cobra los mensajes enviados fuera de la ventana de 24 h desde el último mensaje del paciente
  (dentro de las 24 h son gratis). Hay que contar:
  - total de mensajes que reciben los agentes, y
  - **cuántos salientes caen FUERA de la ventana de 24 h** (esos cuestan). Pueden originarse por:
    (a) el asistente (raro), o (b) **la secretaria/el médico respondiendo a mano por el WhatsApp del
    asistente** desde el panel — eso le genera costo a Héctor.
  - *Implementación:* `wa_mensajes` tiene timestamps; se computa cada saliente vs. el último entrante
    del contacto → "dentro/fuera de 24 h". Atribuir el saliente a su origen (agente vs humano/panel).
- *(Más métricas las irá definiendo el dueño; estas son las prioritarias por su impacto en costo.)*

## 6. Orquestador v1 (acotado por DD5)

- **Observa:** `wa_bitacora` (todos los médicos) + señales del sistema (pagos MP, salud de canales).
- **Detecta:** errores repetidos, sync caída, token Meta por vencer, pago fallido, médico en prueba
  por vencer.
- **Avisa** por WhatsApp + email (DD6). **No actúa** (v1).
- **Runtime:** a definir (cron/job simple para v1; servidor 24/7 / LLM local / API capaz para la
  versión agéntica plena). El "orquesta otros agentes / decide si interviene" = visión posterior.

## 7. Fases sugeridas (construir por etapas, con prueba en vivo cada una)

- **F4.1 — Superadmin read-only** (DESBLOQUEADO, sin pagos): rol superadmin + vista de todos los
  médicos + métricas del negocio + salud del sistema. Te da visibilidad ya.
- **F4.2 — Planes + candado + trial:** tabla de suscripciones + feature-gating Básico/Full + prueba
  gratis de 15 días con el **sandbox demo** (número de prueba compartido + dashboard demo, DD8/DD9).
- **F4.3 — MercadoPago Suscripciones:** cobro recurrente, webhooks, estados (prueba→activa→morosa→…).
- **F5 — Orquestador v1:** observa bitácora + avisa por WhatsApp/email.

## 8. Pendientes del dueño (TBD — definir para cerrar el spec)

- ✅ ~~Duración de la prueba~~ → **15 días** (DD4).
- ✅ ~~Qué entra en Básico~~ → facturación **+ asistente IA de facturación** (§3).
- ✅ ~~Métricas prioritarias~~ → costo: tokens/médico + mensajes fuera de ventana 24 h (§5.1).
- **Precios FINALES** — hoy rango (Básico 25–30, Full 55–65). Se cierran tras calcular costos con las
  métricas de §5.1, para fijar el piso de la promo.
- ✅ ~~Número de prueba compartido~~ → **sandbox/demo, el médico se prueba a sí mismo, desambigua
  por su teléfono** (DD8/DD9).
- **Documento operativo de onboarding** (se redacta sobre la 1ª instalación real).
- **Contrato legal** (define qué se presta; ver si la app debe registrar consentimiento/términos).

## 9. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Candado de plan mal hecho → un Básico usa el asistente (fuga de valor) | Enforcement server-side, no solo ocultar en el menú |
| Superadmin cross-tenant rompe el supuesto `medico_id = auth.uid()` | service-role en server actions con guard de rol superadmin estricto + tests |
| Fallos de pago de MP Suscripciones (reintentos, gracia, morosidad) | Estados de suscripción claros + período de gracia + el orquestador avisa |
| Scope creep (es una fase grande, como la 3) | Etapas F4.1→F5 con plan propio y prueba en vivo cada una |
| ~~Número de prueba compartido no desambigua~~ | **RESUELTO (DD8):** es demo, el médico se prueba a sí mismo → mapea por su teléfono (sender). No hay pacientes reales mezclados. |
| **Costo de mensajes fuera de ventana 24 h por humanos** | La métrica §5.1 lo expone; a futuro, avisar/limitar cuando la secretaria/médico generan costo respondiendo tarde a mano |

## 10. Próximo paso

Refinar este borrador con los TBD de §8 → cerrar el spec → plan de implementación de **F4.1**
(superadmin read-only, lo desbloqueado) → construir → prueba en vivo del dueño.
