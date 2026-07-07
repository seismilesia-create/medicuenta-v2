# Extracción genérica de órdenes por foto (núcleo común + "no encontrado → manual")

**Fecha:** 2026-07-07
**Estado:** Diseño aprobado.
**Enfoque elegido:** A — Núcleo genérico + extras OSEP + JSON crudo.

## 1. Contexto y objetivo

Hoy el médico saca una foto de una orden médica y el sistema la extrae por OCR (Haiku
vía OpenRouter + Vercel AI SDK) y autopobla el form de la orden (`EscanearOrdenButton`
→ `/api/ocr-orden` → `NuevaOrdenForm`). **El pipeline ya existe**, pero está modelado
exactamente sobre la orden de **OSEP**: el schema tiene ~45 campos con terminología OSEP
(delegación, arancelista, cajero, cara/pieza, título de autorización) y el prompt dice
literal *"orden médica de OSEP (Catamarca)"*.

**Problema.** El médico presenta a muchas obras sociales, pero solo tenemos el modelo de
orden de OSEP. Para las demás OS no hay garantía de que la extracción degrade bien, y el
schema usa `""`/`0` para vacíos, lo que **confunde "este campo no existe en esta OS" con
"no lo pude leer"**.

**Objetivo.** Generalizar la extracción para que funcione con la foto de **cualquier OS
desde ya**, extrayendo un **núcleo común de datos de facturación**, y marcando
explícitamente lo que no se encontró como **"cargar a mano"**. Cuando más adelante se
escaneen los modelos de otras OS, se valida si extrajo bien y se decide si registrar más
datos — sin re-fotografiar nada, reprocesando el OCR crudo guardado.

**No-objetivo.** Modelar los campos propios de cada OS antes de tener sus fotos; el
reproceso batch (queda como capacidad); el flujo de nivel 2 (foja quirúrgica por voz).

## 2. Investigación: qué lleva una orden médica en Argentina

Requisitos comunes a cualquier OS (instructivos de facturación de círculos médicos +
Superintendencia de Servicios de Salud), que fundamentan el núcleo:

- Beneficiario: apellido, nombre y **DNI**.
- **N° de afiliado + plan** al que pertenece.
- **Descripción de la prestación** (consulta o práctica) + **código de nomenclador**.
- **Diagnóstico**.
- **Fecha**.
- **Firma y sello del médico** + conformidad del afiliado (firma, aclaración, DNI).
- **Honorarios** según nomenclador (el Nomenclador Nacional codifica cada práctica con un
  código único — estándar que toda OS usa).

Fuentes: Instructivo de facturación de obras sociales (Círculo Médico de Paraná);
Normas Operativas y de Facturación (Círculo Médico de Catamarca); Manual del Beneficiario
(sssalud.gob.ar); Nomenclador Nacional de Prestaciones Médicas.

## 3. Alcance

- **Sí:** núcleo común de 12 campos extraído de cualquier OS; distinción explícita
  "no encontrado" vs "dudoso"; flag `incompleta` derivado; gate de presentación;
  generalización del form (núcleo siempre, extras OSEP condicionales); persistir el OCR
  crudo en `ordenes.datos_ocr`.
- **No:** columnas por OS; reproceso batch (capacidad, no build); nivel 2.

## 4. Núcleo de 12 campos (set común lean)

Lo que el OCR extrae de cualquier OS. Mapea a columnas que **ya existen** (cero columnas
nuevas para los datos):

| # | Campo núcleo | Columna existente | Origen |
|---|---|---|---|
| 1 | N° de orden (consulta/práctica) | `nro_comprobante` (+ `token_osep`) | OCR |
| 2 | Fecha de emisión | `fecha_emision` | OCR |
| 3 | Fecha de práctica | `fecha_atencion` | OCR |
| 4 | Apellido y nombre | `nombre_paciente` | OCR |
| 5 | DNI | `nro_documento` | OCR |
| 6 | N° de afiliado | `nro_afiliado` | OCR |
| 7 | Plan / cobertura | `cobertura` | OCR |
| 8 | Obra social | `obra_social` + `codigo_os` | OCR + catálogo |
| 9 | Tipo de práctica | `nombre_practica` | OCR |
| 10 | Codificación | `codigo_practica` | OCR |
| 11 | Diagnóstico | `diagnostico_cie10` | OCR |
| 12 | Firma+sello / conformidad | `firma_paciente` + `firma_sello_medico` | OCR |
| ref | Importe leído (coseguro) | `total_cargo_afiliado` | OCR (referencia) |
| calc | **Honorario** | `honorario_calculado` | **Sistema** (arancel/nomenclador) |

Notas:
- **Obra social** se suma al núcleo (aunque no estaba en la lista original de 8): es
  imprescindible para calcular honorario y saber a quién facturar.
- El **honorario** NO se extrae de la foto (el número visible suele ser el coseguro del
  afiliado, no el honorario del médico). Se calcula por sistema (§7). El importe leído se
  guarda como referencia de control en `total_cargo_afiliado`.
- Firma+sello cuenta como **un** ítem de núcleo pero son dos flags; ambos deben leerse.

## 5. Schema OCR reestructurado (`src/lib/ai/ocr-orden.ts`)

- **Prompt agnóstico de OS.** Pasa de "orden médica de OSEP" a: "puede ser una orden de
  cualquier obra social argentina; leé por significado, no por posición fija". Mantiene la
  **regla de oro** actual (ante la duda, vacío) y `es_orden_medica`/`motivo_rechazo`.
- **Salida en bloques:**
  - `nucleo`: los 12 campos comunes (con las mismas claves semánticas de la tabla §4).
  - `extras_osep`: los ~33 campos OSEP actuales (delegación, arancelista, cajero,
    cara/pieza, título de autorización, etc.), que el modelo llena **solo si detecta que
    es OSEP**; para otra OS quedan vacíos.
  - `no_encontrados: string[]`: cuáles de los campos de texto/número del núcleo el modelo
    **no pudo encontrar** en la imagen (distinto de vacío-porque-el-campo-no-aplica). Las
    firmas (booleanos) no entran acá: el modelo siempre las reporta `true`/`false`; su
    ausencia se evalúa como `false` en la completitud (§6).
  - `campos_dudosos: string[]` y `confianza`: se mantienen (ya existen).
- **Restricción de union types intacta:** se sigue evitando `.nullable()`/`.optional()`;
  vacíos = `""`/`0`. `no_encontrados` es la señal explícita de ausencia.

### Distinción "no encontrado" vs "dudoso" (resuelve el pedido central)

| Estado | Significado | UX en el form |
|---|---|---|
| `no_encontrado` | no está en la imagen / no se pudo leer | campo vacío + chip rojo **"cargar a mano"** |
| `dudoso` | leído pero baja confianza | campo lleno + borde ámbar **"verificá"** (lo actual) |
| OK | leído con confianza | campo lleno, sin marca |

## 6. Modelo de datos

Migración **mínima: 1 columna aditiva** (tabla con datos, columna nullable → segura):

```sql
alter table public.ordenes
  add column if not exists datos_ocr jsonb;
```

- `datos_ocr`: OCR crudo completo (objeto extraído entero) + metadatos `{ modelo,
  prompt_version, extraido_at }`. Habilita el **reproceso sin re-fotografiar** (§9).
- **Completitud = derivada, NO se persiste** (mismo patrón que `riesgo-debito.ts`). Una
  función pura `evaluarCompletitud(orden)` mira las columnas del núcleo y devuelve
  `faltantes: CampoNucleo[]`; `incompleta = faltantes.length > 0`. No hace falta columna
  porque los 12 ya viven en columnas. Los campos de texto/número faltan cuando están vacíos;
  las firmas faltan cuando son `false` (mismo criterio que `riesgo-debito`).
- Los ~33 campos OSEP siguen en sus columnas actuales (no cambian).

## 7. Honorario (lo calcula el sistema)

Se mantiene el cálculo actual, se elimina el atajo desde la foto:

- **Consulta** (sin práctica del nomenclador): `getArancelVigente(codigo_os, fecha)` →
  `calcularHonorarioConsulta(...)`.
- **Práctica**: `prestaciones.total` por código (`buscarPrestacionPorCodigo`).
- **Cambio concreto:** en `handleOcrExtracted` de `NuevaOrdenForm`, **quitar**
  `setHonorario(data.importe ...)`. El importe leído va a `total_cargo_afiliado`
  (coseguro, referencia). El honorario queda gobernado por el arancel/nomenclador.
- Si no hay arancel vigente ni práctica → honorario en modo manual (como hoy).

## 8. Flujo end-to-end

1. Foto (`EscanearOrdenButton`, cámara/galería, comprime a JPEG) → `POST /api/ocr-orden`.
2. La ruta corre `generateObject` con el schema reestructurado → devuelve
   `{ es_orden_medica, nucleo, extras_osep, no_encontrados, campos_dudosos, confianza }`.
3. `NuevaOrdenForm` autopobla: núcleo → sus campos; extras OSEP → sus campos (si vinieron).
   - Campos en `no_encontrados` → vacíos + chip rojo "cargar a mano".
   - Campos en `campos_dudosos` → borde ámbar "verificá".
   - Banner superior: *"⚠ Faltan N datos importantes"* + lista clickeable (scroll al campo).
4. El médico completa/corrige. Honorario se calcula solo (§7).
5. **Guardar siempre** (aunque falten datos). Se sube la foto al bucket `comprobantes` y se
   persiste `datos_ocr` con el crudo.
6. `evaluarCompletitud(orden)` deriva `incompleta`; se muestra badge en el listado/detalle.
7. **Presentar:** una orden `incompleta` no puede incluirse en una presentación hasta que
   el núcleo esté completo (leído o cargado a mano). Único bloqueo del flujo.

## 9. Generalización del form (`NuevaOrdenForm`)

- **Núcleo siempre visible** para toda OS (paciente, DNI, afiliado, cobertura, OS, práctica,
  código, diagnóstico, fechas de emisión/atención, firmas, N° de orden).
- **Secciones OSEP-específicas** (Delegación/Comprobante extendido, Token OSEP, cara/pieza
  odontología, arancelista/cajero) se renderizan **solo si `codigo_os === 327`** (o si el
  OCR marcó OSEP). Para otras OS: form limpio de núcleo + los extras que efectivamente trajo.
- Se preserva todo lo existente que ya es genérico: correlación turno→orden (3C), control
  de 15 min (OSEP), riesgo de débito, aviso de OS suspendida.

## 10. Reproceso futuro (capacidad, no se construye ahora)

Con `datos_ocr` crudo + la foto en `comprobantes`, cuando se escanee el modelo de otra OS
se puede correr un reproceso batch que reevalúa la extracción contra ese modelo, sin volver
a fotografiar. Queda documentado como capacidad habilitada por el diseño; fuera de alcance.

## 11. Errores y edge cases

- **No es orden médica** (`es_orden_medica=false`) → mensaje, no autopobla.
- **OS no matchea el catálogo** → `obra_social` texto libre, `codigo_os=null`, honorario en
  modo manual (como hoy).
- **Falla el OCR** (timeout/error de la ruta) → carga 100% manual: form vacío, todos los del
  núcleo como "cargar a mano".
- **Falla subir la foto** → guarda igual (como hoy); `datos_ocr` igual conserva el crudo.
- **Firma+sello ausentes** → cuentan como faltante de núcleo **y** disparan el riesgo de
  débito existente (dos señales, coherentes; ver §12).

## 12. Reconciliación con lo existente (no duplicar)

- **`riesgo-debito.ts`** (`evaluarRiesgoOrden`) se mantiene tal cual: es la señal específica
  "te van a debitar" sobre 3 campos de compliance (firma afiliado, diagnóstico, firma+sello),
  derivada y no persistida. **Completitud es un concepto sibling y más amplio** (los 12 del
  núcleo). Los 3 de compliance aparecen en ambos, con mensajes distintos: riesgo → "riesgo de
  débito"; completitud → "faltan N datos importantes / no se puede presentar". No se
  entrelazan para no tocar una regla anti-débito ya validada.
- **`campos_dudosos`** y el resaltado ámbar se reutilizan tal cual (verificá). `no_encontrados`
  es la señal nueva y ortogonal (cargar a mano).
- **Columnas**: se reutilizan todas las del núcleo; única columna nueva `datos_ocr`.

## 13. Componentes y responsabilidades

| Componente | Responsabilidad | Depende de |
|---|---|---|
| `ordenExtraidaSchema` + `OCR_ORDEN_PROMPT` (`src/lib/ai/ocr-orden.ts`) | Definir núcleo + extras_osep + no_encontrados; prompt agnóstico | zod |
| `/api/ocr-orden` (`src/app/api/ocr-orden/route.ts`) | Correr el OCR y devolver la estructura nueva | schema, openrouter |
| `evaluarCompletitud(orden)` (`src/lib/ordenes/completitud.ts`, nuevo, puro) | Derivar `faltantes[]` / `incompleta` del núcleo | tipos de orden |
| `EscanearOrdenButton` (`src/features/ordenes/components/`) | Captura foto → OCR (sin cambios de contrato salvo el tipo de retorno) | `/api/ocr-orden` |
| `NuevaOrdenForm` (`src/features/ordenes/components/`) | Autopoblar núcleo, marcar no_encontrados/dudosos, extras OSEP condicionales, honorario por sistema, persistir `datos_ocr` | schema, completitud, catálogo, nomenclador |
| Detalle/listado de órdenes (`src/app/(main)/ordenes/`) | Badge "Incompleta — faltan N" | `evaluarCompletitud` |
| Flujo de presentación (`presentaciones`/`presentacion_id`) | Bloquear incluir órdenes incompletas | `evaluarCompletitud` |

## 14. Testing

- **Unit puro:** `evaluarCompletitud` — los 12 campos, combinaciones de faltantes, solo
  aplica a obra social nivel 1, firma+sello como par.
- **Unit puro:** mapeo `no_encontrados` → estado visual del campo (helper que decide
  chip rojo / ámbar / OK).
- **Schema Zod:** parseo de una respuesta con `nucleo` completo + `extras_osep` vacíos
  (caso no-OSEP) y con extras llenos (caso OSEP).
- **Manual (E2E):** foto OSEP (extrae núcleo + extras), foto de otra OS simulada (solo
  núcleo, extras vacíos), campo faltante → chip rojo → carga manual → completitud pasa a
  OK → orden presentable. Patrón del proyecto: lógica pura con vitest, integración a mano.

## 15. No incluido (YAGNI)

- Modelar campos propios de cada OS antes de tener sus fotos.
- Reproceso batch del OCR crudo (capacidad habilitada, no se construye).
- Nivel 2 (foja quirúrgica por voz).
- Pago efectivo/transferencia u otras formas de saldo (fuera de tema).
