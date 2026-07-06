# Orden de consulta OSEP: cobro de la receta electrónica vía secretaria

**Fecha:** 2026-07-06
**Estado:** Diseño aprobado (Fase A). Fase B documentada como futura.

## 1. Contexto y objetivo

Hoy el bot de WhatsApp entrega la receta electrónica al paciente **solo** contra un pago (link de MercadoPago del médico). Las recetas que carga el médico son las que "bajan de la app de OSEP" → el paciente es afiliado OSEP.

En OSEP, la vía "correcta" para el paciente es sacar una **orden de consulta**: la secretaria del médico (que trabaja en el sanatorio y tiene usuario en el sistema de OSEP) valida los datos del afiliado + un token, **emite la orden de consulta** en el sistema hacia el médico, y con eso se "libera" la receta.

**Objetivo (Fase A):** que el paciente pueda elegir, además de pagar, **gestionar la receta por su obra social**. Cuando elige esa vía, la secretaria toma la conversación, emite la orden en OSEP (fuera de la app) y desde el panel **libera la receta**: el bot le manda el PDF al paciente y queda registrada la constancia (forma de pago = orden de consulta + nº de orden + quién/cuándo).

**No-objetivo (Fase A):** crear la orden de consulta dentro de MediCuenta / facturarla. Eso es la **Fase B** (§10), que se apoya en la data que captura la Fase A.

## 2. Alcance

**Fase A (este spec):**
- El bot ofrece dos vías al pedir la receta: pagar (MP) **o** gestionar por obra social (secretaria) — condicionado al horario.
- La secretaria libera la receta desde el panel `/conversaciones`; el bot entrega el PDF.
- Se registra la constancia en `recetas`.
- El médico puede ver que una receta se entregó "por orden de consulta OSEP" (distinta de las pagadas).

**Fase B (futura, §10):** crear la orden de consulta (nivel 1, OSEP) en las órdenes del médico a partir de la receta liberada, con hora inventada anti-colisión 15 min y nota "sin atención física".

## 3. Flujo end-to-end (Fase A)

1. **Paciente pide la receta** (a cualquier hora). El bot la encuentra (`buscar_receta_paciente`, estado `pendiente_pago`).
2. **El bot ofrece las opciones según el horario de atención del médico** (= horario de la secretaria, §7):
   - **Dentro de horario:** "Podés (1) pagarla acá 👉 [link MP] o (2) gestionarla por tu obra social, y te atiende la secretaria."
   - **Fuera de horario:** "Por obra social te atiende la secretaria de [Lun-Vie 9-13h]. Si la querés ya, la podés pagar acá 👉 [link]. Si preferís la vía obra social, escribime en ese horario." (El paciente vuelve solo → siempre dentro de la ventana de 24h de Meta, sin costo de plantilla.)
3. **Paciente elige "obra social" (en horario)** → el bot llama la tool `solicitar_orden_consulta`:
   - Re-verifica el horario server-side (determinismo: no depende de que el LLM respete el horario).
   - Si está en horario: marca `necesita_humano` + pausa el bot en la conversación (reusa `avisar_consultorio`), deja una nota "el paciente quiere gestionar su receta por orden de consulta OSEP" y responde al paciente "Te atiende la secretaria en un momento 🙌".
   - Si está fuera de horario: responde el mensaje de horario + link MP (no deriva).
4. **La secretaria toma la conversación** en `/conversaciones` (ve la alarma, `responderComoHumano`), le pide al paciente datos de afiliado + token, y **valida/emite la orden en el sistema de OSEP** (afuera, en su PC).
5. **La secretaria libera la receta** desde el panel: acción "Liberar receta por orden de consulta" → ve las recetas pendientes de ese paciente (match por teléfono/contacto de la conversación) → elige la que corresponde, escribe el **nº de orden de consulta**, confirma.
6. **El servidor** (server action `liberarRecetaPorOrdenConsulta`):
   - Autoriza a la secretaria/dueño del consultorio (`puede_acceder_consultorio`).
   - Registra la constancia (`forma_pago='orden_consulta'`, `nro_orden_consulta`, `liberada_por`, `liberada_at`) y transiciona la receta `pendiente_pago → pagada` (reclamo condicional por estado, anti-doble).
   - **Entrega el PDF al toque**: resuelve el canal saliente del médico (nodo) y manda el documento, reusando el mecanismo de entrega (reclamo atómico `pagada → entregada` + envío, con compensación si el envío falla).
7. **El médico** ve en su resumen de recetas (comando `recetas` del bot y/o panel) cuáles se entregaron por orden de consulta vs pagadas.

## 4. Componentes y responsabilidades

| Componente | Responsabilidad | Depende de |
|---|---|---|
| `secretariaDisponible(horarios, excepciones, ahoraAR)` (puro, `src/lib/whatsapp/`) | ¿Hay secretaria ahora? = ¿el instante actual (hora AR) cae dentro del horario semanal del médico, respetando excepciones? | — (misma convención de `weekday` que turnos) |
| tool `solicitar_orden_consulta` (`agent/tools.ts`) | Deriva a la secretaria si está en horario; si no, responde horario + opción MP. Enforcement server-side del horario. | `secretariaDisponible`, `avisar_consultorio`/`necesita_humano`, `getHorarios` |
| systemPrompt paciente | Recibe una pista "secretaria disponible ahora: sí/no" + el horario, para presentar bien las opciones. | estado de horario calculado en `handlePaciente` |
| `getRecetasPendientesDeContacto(contactoId\|telefono)` (action) | Lista las recetas `pendiente_pago` del paciente de esa conversación, para el panel. Autorizada por consultorio. | `puede_acceder_consultorio`, service-role |
| `liberarRecetaPorOrdenConsulta({recetaId, nroOrden})` (action) | Autoriza, registra constancia, `pendiente_pago→pagada`, dispara entrega del PDF. | `puede_acceder_consultorio`, `recetasService`, `entrega`, `resolverSaliente` |
| UI "Liberar receta" en `/conversaciones` | Dentro de la conversación tomada: botón → modal con recetas pendientes + campo nº de orden + confirmar. | las dos actions de arriba |
| `resumenRecetas` (médico) | Distinguir recetas entregadas por orden de consulta. | `recetas.forma_pago` |

## 5. Modelo de datos

Columnas nuevas en `recetas` (migración aditiva; tabla con datos pero columnas nullable → segura):

```sql
alter table public.recetas
  add column if not exists forma_pago text
    check (forma_pago is null or forma_pago in ('mercadopago','orden_consulta','efectivo','transferencia')),
  add column if not exists nro_orden_consulta text,
  add column if not exists liberada_por uuid references auth.users(id),
  add column if not exists liberada_at timestamptz;
```

- `forma_pago`: cómo se saldó la receta. `mercadopago` lo setea el webhook MP al pagar (retrofit: se puede backfillear a 'mercadopago' donde `estado in ('pagada','entregada')` y hay `mp_payment_id`). `orden_consulta` lo setea la liberación por secretaria. `efectivo`/`transferencia` quedan previstos (no se implementan en Fase A).
- `nro_orden_consulta`: nº que escribe la secretaria (constancia; alimenta Fase B).
- `liberada_por` + `liberada_at`: quién y cuándo liberó por orden de consulta (auditoría).

No se agrega FK a `ordenes` en Fase A (la orden se crea en Fase B; ahí se vinculará).

## 6. Seguridad / autorización

- **La secretaria NO ve `recetas` por RLS** (por diseño: el rol secretaria no accede a recetas/facturación). Por eso la lectura (`getRecetasPendientesDeContacto`) y la escritura (`liberarRecetaPorOrdenConsulta`) van por **server actions** que:
  1. Verifican que el usuario es dueño **o** secretaria de ese consultorio (`resolverConsultorio`/`puede_acceder_consultorio` sobre el `medico_id` de la receta).
  2. Operan con **service-role** (bypass RLS) solo después del check — mismo patrón que las demás acciones de `consultorio-*`.
- La acción valida además que la receta pertenece al `medico_id` del consultorio y que está en `pendiente_pago` (no re-liberar una entregada).
- El envío del PDF usa las credenciales del nodo (descifradas, service-role) — nunca expuestas al cliente.

## 7. Reglas de horario

- Fuente: `wa_horarios` (`{weekday, open_time, close_time}` por médico) + `wa_excepciones` (feriados/cierres), **el mismo horario que usa turnos**. Cero config nueva.
- `secretariaDisponible` compara el instante actual en **hora de Argentina** (`America/Argentina/Catamarca`) contra los bloques del día, restando excepciones. Función pura, testeable.
- **Médico sin horario cargado** → `secretariaDisponible` = false siempre → el bot solo ofrece MP y (una vez) sugiere al médico cargar su horario para habilitar la vía secretaria. (No se inventa disponibilidad.)

## 8. Manejo de errores y edge cases

- **Fuera de horario:** la tool `solicitar_orden_consulta` no deriva; responde horario + link MP. Enforcement server-side (no confiar en el LLM).
- **Paciente con varias recetas pendientes:** el panel las lista todas; la secretaria elige cuál libera (puede repetir la acción para varias).
- **Receta ya pagada/entregada:** la acción rechaza (solo `pendiente_pago` es liberable). El reclamo por estado evita doble entrega.
- **Falla el envío del PDF tras marcar entregada:** compensación existente (`entregada → pagada`) para reintentar; la constancia queda igual (ya está saldada).
- **Ventana de 24h de Meta:** la entrega la dispara la secretaria mientras el paciente está en una conversación activa (recién chatearon) → dentro de la ventana → envío gratis. El diseño de "fuera de horario, que vuelva a escribir el paciente" evita reabrir chats fuera de ventana.
- **`nro_orden` vacío:** se pide en el panel; se registra la liberación con el número que ingrese la secretaria (requerido para esta vía, porque es la constancia y alimenta Fase B).

## 9. Testing

- **Unit (puro):** `secretariaDisponible` — dentro/fuera de bloque, límites exactos, día sin horario, feriado (excepción), cambio de día en hora AR (bug UTC), médico sin horario.
- **Unit (puro):** helper de decisión de opciones del bot (si existe una función que arma el texto/estado de opciones a partir de `disponible` + `link`).
- **Lógica de liberación:** reclamo condicional `pendiente_pago→pagada` (no libera si no está pendiente).
- Las server actions y la UI se validan manualmente en E2E (patrón del proyecto: lógica pura con vitest, integración a mano).

## 10. Fase B (futura) — documentada, no se implementa ahora

Cuando el médico facture, crear una **orden de consulta** (nivel 1, `codigo_os=327` OSEP, `agente_facturador='circulo_medico'`) a partir de cada receta liberada por orden de consulta:

- **Nota al médico** en la orden: "entregada por receta electrónica — sin atención física del paciente".
- **Hora de atención inventada:** no hubo atención real, así que se genera una hora que **no colisione dentro de 15 min con otra orden de OSEP del mismo día** (reusar el control de 15 min ya existente en la correlación/pre-check). Colisionar con pacientes de **otras** obras sociales no importa (la regla de 15 min es intra-OS).
- **Vínculo:** la orden referencia la receta y el `nro_orden_consulta`.
- Data ya disponible de Fase A: `forma_pago='orden_consulta'`, `nro_orden_consulta`, `liberada_por/at`, `paciente_nombre/dni`, `datos_ocr`.
- Decisión pendiente de Fase B: ¿la orden se crea al liberar (borrador) o en un paso de "generar órdenes del mes"? (se define al diseñar Fase B).

## 11. No incluido (YAGNI)

- Cola de "pedidos pendientes" para la secretaria fuera de horario (descartado: riesgo de reabrir chat fuera de ventana de 24h → costo Meta).
- Pago efectivo/transferencia con constancia (previsto en `forma_pago` pero no implementado en Fase A).
- Creación/facturación de la orden de consulta (Fase B).
- Integración API directa con el sistema de OSEP (la secretaria opera OSEP afuera; la app solo libera la receta).
