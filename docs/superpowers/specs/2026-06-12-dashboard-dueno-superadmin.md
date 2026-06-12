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
| **DD4** | **Prueba gratis: SÍ** | Período de prueba para bajar la barrera de adopción (duración TBD — ej. 14/30 días). |
| **DD5** | **Orquestador v1: observa y avisa, NO actúa solo** | Máxima seguridad mientras se le agarra confianza. Autonomía configurable = futuro. |
| **DD6** | **Avisos por WhatsApp + Email** | WhatsApp al número de Héctor (inmediato) + email (informes/registro). |

## 3. Consecuencia técnica central: candado de funciones por plan (feature-gating)

Hoy **todos los médicos ven todo** — no hay gating. Con DD2, el plan Básico NO debe acceder al
asistente/agenda/recetas. Se necesita:
- Una **fuente de verdad del plan** del médico (tabla de suscripciones / `perfiles.plan`).
- **Enforcement en 3 capas** (como el guard de rol de 3B): ocultar en el menú · redirigir en el
  middleware · y chequeo server-side (acciones/RLS) para que no se acceda por API.
- Mapa de gating (propuesta, **a confirmar**):
  - **Básico:** Dashboard, Órdenes, Liquidaciones, Débitos, Cirugías, Nomenclador, Reportes.
  - **Full:** lo anterior **+** Agenda, Conversaciones, Pacientes, Asistente de turnos (config),
    el asistente de WhatsApp (turnos/recetas/cobros) y la secretaria.
  - **A decidir:** ¿el asistente IA de facturación (el chat que ayuda a cargar órdenes) es Básico
    o Full? (Hoy es parte de la app de facturación.)

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
   (churn), uso agregado (turnos/recetas/mensajes/órdenes procesados), crecimiento.
4. **Salud del sistema (semilla del orquestador):** errores agregados de `wa_bitacora` de TODOS los
   médicos, alertas (sync caída, token Meta vencido, pago fallido).

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
- **F4.2 — Planes + candado:** tabla de suscripciones + feature-gating Básico/Full + prueba gratis.
- **F4.3 — MercadoPago Suscripciones:** cobro recurrente, webhooks, estados (prueba→activa→morosa→…).
- **F5 — Orquestador v1:** observa bitácora + avisa por WhatsApp/email.

## 8. Pendientes del dueño (TBD — definir para cerrar el spec)

- **Precios** de cada plan.
- **Duración** de la prueba gratis.
- **Métricas exactas** que querés ver primero en el panel.
- **Qué entra exacto en Básico** (sobre todo: ¿el asistente IA de facturación va en Básico o Full?).
- **Documento operativo de onboarding** (se redacta sobre la 1ª instalación real).
- **Contrato legal** (define qué se presta; ver si la app debe registrar consentimiento/términos).

## 9. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Candado de plan mal hecho → un Básico usa el asistente (fuga de valor) | Enforcement server-side, no solo ocultar en el menú |
| Superadmin cross-tenant rompe el supuesto `medico_id = auth.uid()` | service-role en server actions con guard de rol superadmin estricto + tests |
| Fallos de pago de MP Suscripciones (reintentos, gracia, morosidad) | Estados de suscripción claros + período de gracia + el orquestador avisa |
| Scope creep (es una fase grande, como la 3) | Etapas F4.1→F5 con plan propio y prueba en vivo cada una |

## 10. Próximo paso

Refinar este borrador con los TBD de §8 → cerrar el spec → plan de implementación de **F4.1**
(superadmin read-only, lo desbloqueado) → construir → prueba en vivo del dueño.
