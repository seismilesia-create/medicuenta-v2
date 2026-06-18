# Spec — Pre-check anti-débito + Emisión de planilla

- **Fecha:** 2026-06-18
- **Estado:** Aprobado para pasar a plan de implementación
- **Origen:** Backlog del contador del Círculo Médico (reunión 2026-06-18), Item 2 (*pre-check anti-débito*), ampliado durante el brainstorming con **emisión de planilla** como momento del chequeo.
- **Item del backlog:** primero de la lista de modificaciones (barato + alto impacto + genera confianza con médicos, requisito que el contador marcó para todo lo demás).

---

## 1. Objetivo y contexto

**Problema.** El motivo de rechazo/débito #1 de las obras sociales es **falta de firma o de diagnóstico** (dato directo del contador del Círculo). Hoy MediCuenta capta esos datos de la foto de la orden (OCR), pero **no avisa ni previene**: la orden se guarda y se presenta igual aunque le falte algo. Si se presenta incompleta → débito → descargo burocrático lentísimo que demora el reconocimiento.

**Objetivo.** Prevenir débitos **avisando y haciendo confirmar** los faltantes *antes* de presentar, en los momentos donde el médico todavía puede corregir. De paso, darle al médico la **planilla** que hoy arma a mano para llevar al Círculo.

**Valor estratégico.** Win visible y barato. El contador fue explícito: generar confianza con los médicos vía la app es el requisito previo para todo lo demás (incluida la futura app B2B del Círculo).

---

## 2. Alcance

### Dentro de esta v1
- Órdenes de **obra social**, **nivel 1** (consultas y prácticas ambulatorias).
- Checklist de faltantes: **firma del afiliado**, **diagnóstico**, **firma y sello del médico**.
- Aviso en **3 puntos**: al cargar/escanear, al emitir la planilla, e indicador en el listado.
- Acción **"Resolver faltantes"** con constancia (registro de la confirmación).
- **Emisión de planilla imprimible, una por obra social.**

### Fuera de esta v1 (explícito)
- **Cirugías / Nivel 2.** El médico **no presenta** esas órdenes: van **directamente por el sanatorio**, que define la presentación; el médico ni las ve. Quedan fuera **tanto del pre-check como de la planilla**. (El control de honorarios N2 es la *oportunidad A* del backlog, otro item.)
- **Órdenes particulares.** No se debitan → sin chequeo y fuera de la planilla.
- **Token OSEP** como ítem del checklist (se mantiene la validación de formato actual, pero no se suma al pre-check anti-débito en esta versión).
- **Reglas por obra social** (qué campo es obligatorio según cada OS). Dependen de la *tabla canónica de OS* (Item 4 del backlog). En v1 el checklist es **universal**.
- **Persistencia pesada de planillas** (entidad/tabla de planillas). En v1 la planilla se **imprime al vuelo** desde las órdenes del período.

---

## 3. Decisiones de diseño (cerradas en el brainstorming)

1. **Estrictez: avisar y confirmar (freno blando). Nunca bloqueo duro.**
   La firma del afiliado la detecta la IA desde la foto y puede equivocarse → el médico es la autoridad final. Un bloqueo duro trabaría órdenes válidas por un falso negativo de la IA.
2. **Riesgo derivado, no persistido (Camino A).**
   El "riesgo" se calcula al vuelo a partir de los datos que la orden ya tiene; no se guarda un estado de riesgo redundante. Esto evita desincronización y deja la puerta abierta a enchufar reglas por-OS (Item 4) sin reescribir.
3. **Firma y sello del médico = dato nuevo, detectado por IA + corregible.**
   Espeja exactamente cómo funciona hoy `firma_paciente` (la IA pre-marca, el médico corrige con un tilde).
4. **El chequeo del momento de presentación se ancla a la emisión de la planilla.**
   Es el momento real "antes de llevar las órdenes al Círculo".

---

## 4. Comportamiento detallado

### ① Al cargar / escanear una orden (pantalla "Nueva orden")
- Tras el OCR (o al editar), si la orden es de **obra social** (nivel 1) y le falta alguno del checklist, aparece un **cartel ámbar visible pero no invasivo** cerca del botón Guardar, listando qué falta:
  > ⚠️ *Riesgo de débito: falta la firma del afiliado y el diagnóstico. Revisá la orden antes de presentarla.*
- **No bloquea.** El médico corrige ahí (tilda firma, escribe diagnóstico) o guarda en borrador con el faltante.

### ② Al emitir la planilla (flujo nuevo)
1. El médico elige **período (mes)** y **agente facturador** (por defecto *Círculo Médico*).
2. La app junta sus **borradores** de ese período/agente (obra social, nivel 1), los **agrupa por obra social** y corre el chequeo.
3. Si hay órdenes en riesgo → **diálogo de confirmación** que las lista (`Paciente — OS — qué falta`), con tres acciones:
   - **Presentar igual (todas)**
   - **Presentar solo las OK** (deja las que tienen riesgo en borrador para corregir)
   - **Cancelar y revisar**
4. Al confirmar: marca las órdenes elegidas como **presentadas** y **genera una planilla imprimible por cada obra social**.

**Contenido de cada planilla (una por OS):**
- Encabezado: datos del médico (nombre, matrícula), período, obra social, agente facturador.
- Tabla de órdenes: paciente, fecha de atención, código/práctica, monto/honorario.
- Pie: cantidad total de órdenes y monto total.
- Pensada para **imprimir por duplicado** (la lleva físicamente al Círculo).

### ③ En el listado de órdenes
- Las órdenes en **borrador** con faltantes muestran un **puntito ámbar de "riesgo"** en su fila, con tooltip de qué falta. Solo en borradores (no en presentadas).

### ➕ Resolver faltantes
- En cada borrador en riesgo, una acción **"Resolver faltantes"** abre un panel con **solo lo que falta**:
  - **Diagnóstico** → lo escribe.
  - **Firma del afiliado** / **Firma y sello del médico** → las tilda ("ya está firmada").
- Al confirmar: se completan/actualizan los datos, **queda registrada la confirmación (fecha)** como constancia que protege al médico, y el **puntito desaparece** (la orden deja de saltar el aviso al presentar).

---

## 5. Modelo de datos (cambios sobre la tabla `ordenes`)

> RLS ya está activa en `ordenes` por `medico_id`. Todos los campos nuevos son nullable/con default → migración segura.

- `firma_sello_medico boolean DEFAULT false` — **esencial.** Detectado por OCR, corregible por el médico (espeja `firma_paciente`).
- `presentada_at timestamptz NULL` — fecha en que se marcó como presentada. Hoy no existe timestamp de presentación (solo el estado `'presentada'` + `updated_at`). Útil para el período de la planilla y auditoría.
- `faltantes_confirmados_at timestamptz NULL` — **constancia** de cuándo el médico confirmó haber resuelto los faltantes vía "Resolver faltantes". (Mínimo; el "qué" queda reflejado en los propios campos `firma_paciente` / `firma_sello_medico` / `diagnostico_cie10`.)

**No se crean tablas nuevas.** El riesgo es derivado; la planilla se arma al vuelo.

---

## 6. La regla central (pre-check)

Función **pura y reutilizable**:

```ts
evaluarRiesgoOrden(orden): { enRiesgo: boolean; faltantes: FaltanteDebito[] }
// FaltanteDebito ∈ 'firma_afiliado' | 'diagnostico' | 'firma_sello_medico'
```

- Aplica **solo** a `tipo === 'obra_social'` y `nivel === 1`. Para cualquier otra orden devuelve `enRiesgo: false`.
- Reglas v1 (universales): falta firma afiliado si `firma_paciente === false`; falta diagnóstico si `diagnostico_cie10` vacío/null; falta firma médico si `firma_sello_medico === false`.
- **Ubicación sugerida:** `src/features/ordenes/lib/riesgo-debito.ts` (o junto a los tipos en `src/features/ordenes/types/ordenes.ts`).
- **Consumidores (criterio único, sin contradicciones):** `NuevaOrdenForm` (aviso ①), `OrdenesTable` (puntito ③), flujo de emisión de planilla (diálogo ②), panel "Resolver faltantes".
- **Extensibilidad:** mañana la misma función puede recibir las reglas por-OS del Item 4 sin cambiar a sus consumidores.

---

## 7. OCR

- Agregar `firma_sello_medico: z.boolean()` al `ordenExtraidaSchema` en `src/lib/ai/ocr-orden.ts`.
- Sumar instrucción al prompt: *"true si hay firma Y sello del médico en la orden, false si no."* (Análogo a `firma_paciente`.)
- En `NuevaOrdenForm.tsx`, pre-llenar el nuevo checkbox con lo que devuelva el OCR; el médico lo puede corregir.
- Provider/flujo OCR actual sin cambios (Haiku vía OpenRouter, endpoint `src/app/api/ocr-orden/route.ts`).

---

## 8. Emisión de planilla

- **Entrada: el listado de órdenes existente** (`/ordenes`, que ya tiene filtros y selección por lote). Se agrega la acción **"Emitir planilla"** (complementa el actual "marcar como presentadas"): el médico filtra por período (mes) + agente facturador (default `circulo_medico`), selecciona el lote y la dispara. Reutiliza `OrdenFilters`, `OrdenesTable` y `batchUpdateOrdenesEstado`.
- Junta borradores de ese período/agente, **obra social, nivel 1**; agrupa por `obra_social`.
- Corre `evaluarRiesgoOrden` sobre el lote → diálogo (ver ②).
- Confirmar reutiliza la acción existente `batchUpdateOrdenesEstado(ids, 'presentada')` (`src/actions/ordenes.ts`) + setea `presentada_at`.
- **Salida:** una **página imprimible por OS** (print CSS + `window.print()`; "guardar como PDF" del navegador). **Sin librería de PDF** en v1.
- **Período:** se filtra por **`fecha_atencion`** dentro del mes elegido (la facturación es mensual; corte primeros 5 días hábiles del mes siguiente). *Supuesto a confirmar en el review.*

---

## 9. Casos borde / manejo de errores

- **Particulares:** `evaluarRiesgoOrden` devuelve sin riesgo; quedan fuera de la planilla.
- **Nivel 2 / cirugías:** excluidas de todo (no las presenta el médico).
- **Falso negativo de la IA** (dice "sin firma" pero sí está): el médico la tilda → riesgo limpio. Es el comportamiento esperado (autoridad humana).
- **Falso positivo de la IA** (dice "con firma" pero falta): no se mostrará riesgo; el médico puede destildar. Mismo nivel de control que hoy. Aceptado en v1.
- **Diagnóstico no obligatorio en algunas OS:** en v1 avisa igual (universal). El médico presenta igual o completa. Con la tabla canónica de OS (Item 4) el aviso se callará donde no corresponda.
- **Sin borradores en el período:** no hay nada para emitir; mensaje claro.
- **Muchas órdenes en una planilla:** print CSS paginado.

---

## 10. Cómo lo verificamos (testing)

- **Tests unitarios de `evaluarRiesgoOrden`:** todas las combinaciones de faltantes; que `particular` y `nivel 2` queden afuera; bordes (diagnóstico vacío vs whitespace).
- **Integración/componentes:** el aviso ① aparece cuando falta algo; el diálogo ② lista las órdenes en riesgo; "Presentar solo las OK" excluye correctamente; "Resolver faltantes" limpia el riesgo y setea la constancia.
- **OCR:** el schema incluye `firma_sello_medico` (mockeable).
- **E2E (Playwright):** cargar orden sin firma → ver aviso → resolver → emitir planilla → verificar que agrupa por OS con cantidad y total correctos.

---

## 11. Referencias al código actual (para el plan de implementación)

- **Tipos / Zod:** `src/features/ordenes/types/ordenes.ts` (interface `Orden` ~L48-112; `ESTADOS_ORDEN` L8; schemas L149-227).
- **Creación / persistencia / batch:** `src/actions/ordenes.ts` (`createOrden` L7-107; `batchUpdateOrdenesEstado` L224-248).
- **OCR:** `src/lib/ai/ocr-orden.ts` (schema L12-90; prompt L94-114); endpoint `src/app/api/ocr-orden/route.ts`.
- **Formulario:** `src/features/ordenes/components/NuevaOrdenForm.tsx` (submit L214-337; token+firma OSEP L506-516; diagnóstico ~L544).
- **Listado / presentar:** `src/features/ordenes/components/OrdenesTable.tsx` (`handleBatchPresentar` L109-138).
- **Débitos (referencia de motivos):** feature `src/features/debitos/` — motivos predefinidos incluyen `falta_firma`, `falta_diagnostico`, `falta_token`, `error_codigo`.

---

## 12. Supuestos y preguntas abiertas (para el review del spec)

- **S1.** El período de la planilla se filtra por `fecha_atencion`. *(Alternativa: por fecha de carga. Asumo `fecha_atencion`.)*
- **S2.** `faltantes_confirmados_at` como constancia mínima (un solo timestamp). Si más adelante se quiere "quién/qué confirmó" con detalle, se amplía.
- **S3.** La planilla no se persiste como entidad en v1 (se re-imprime al vuelo seleccionando el mismo período/OS). Confirmar que no se necesita un registro guardado de cada presentación.
- **S4.** "Agente facturador" default = `circulo_medico`; el médico puede emitir también para `medical_group` / `comunidad` con el mismo flujo.

---

## 13. Conexión con el resto del backlog (no implementar acá, solo no cerrar puertas)

- **Item 4 (tabla canónica de OS):** alimentará reglas por-OS en `evaluarRiesgoOrden` (qué es obligatorio según la OS y su estado activa/suspendida).
- **Item 3 (aranceles time-varying):** el monto/honorario de la planilla saldrá de ahí cuando exista.
- **Oportunidad C (B2B Círculo):** la planilla estructurada es el embrión del dato que vería el Círculo en tiempo real.
