# Ruteo del bot de WhatsApp por contexto/sesión + desambiguación por nombre

**Fecha:** 2026-07-08
**Estado:** Diseño aprobado.

## 1. Contexto y problema

El bot de WhatsApp usa "nodos": un número compartido por varios médicos (≤50). El
paciente entra por un link/QR `/c/<slug>` que prellena `Hola, quiero hacer una consulta
[ID:<slug>]`; el bot extrae el slug y rutea al médico. Los médicos escriben desde su celular
(match por número). Hoy, en el **primer** `[ID:slug]`, se guarda la asociación en
`wa_ruteo_conversacion` con clave `(phone_number_id, telefono_paciente)` → `medico_id`, y
**todos los mensajes libres siguientes van a ese médico para siempre** (salvo que el
paciente reescanee otro QR, que re-ancla vía upsert).

**Defecto (verificado en el código actual, `src/features/whatsapp/services/nodos.ts`
+ `ruteoConversacion.ts`):** el mismo paciente (mismo número) consulta hoy con el Dr. A y
en dos semanas con el Dr. B. Si reusa el chat viejo y escribe **sin reescanear**, el bot lo
rutea al Dr. A → misruteo entre tenants: el Dr. A ve un mensaje destinado al Dr. B (fuga de
datos entre médicos). El binding permanente es incorrecto para la realidad de uso.

**Además:** cuando el bot no puede resolver el médico (marcador borrado/parcial, primer
contacto sin link) en un nodo multi-médico, hoy solo responde un instructivo
(`MSG_RUTEO_FALLIDO`: "no borres el mensaje, reescaneá el QR") — no rutea, no corre el
agente. No hay desambiguación interactiva.

**Objetivo:** el ruteo pasa a ser **por sesión** (no permanente), y cuando el médico no se
puede resolver, el bot **pregunta al paciente a qué médico le escribe** (por nombre), en
vez de solo pedir reescanear. Los médicos son prestadores públicos y los pacientes ya les
escriben a ese listado, así que mostrar/elegir médico no es un problema de privacidad.

## 2. Alcance

**Sí:**
- Ruteo por sesión con TTL de inactividad (reemplaza el binding permanente).
- Máquina de estados de ruteo por `(nodo, teléfono del paciente)`.
- Desambiguación por **nombre/apellido** con reconfirmación (1 match) o lista por
  **especialidad** (varios con el mismo apellido).
- Re-pregunta "¿mismo médico o diferente?" cuando un paciente conocido retoma tras el TTL.
- Reemplazo de `MSG_RUTEO_FALLIDO` por el flujo de nombre como fallback universal.

**No (YAGNI):**
- Detección de "intención de cambiar de médico" a mitad de sesión (solo el TTL dispara la
  re-pregunta).
- Bufferear el mensaje original del paciente mientras se desambigua (se re-pide contexto
  tras resolver; se puede agregar después).
- Cambios al ruteo médico-por-teléfono, al `[ID:slug]` del QR, o al historial
  `wa_conversaciones`.
- Tabla de sesión separada (se extiende la existente, §8).

## 3. Máquina de estados de ruteo

Estado por fila de ruteo, clave `(phone_number_id, telefono_paciente)`:

- **`activa`** — ruteado a `medico_id`, con actividad reciente. Los mensajes de contenido
  van a ese médico.
- **`esperando_confirmacion`** — el bot preguntó "¿seguís con el Dr. X o es con otro
  médico?" o "¿es el Dr. Y? [Sí/No]". El próximo mensaje del paciente se interpreta como
  respuesta, no como contenido.
- **`esperando_nombre`** — el bot pidió "escribí el apellido del médico". El próximo
  mensaje es el nombre a matchear.
- **`esperando_seleccion`** — el bot mostró una lista de N médicos con el mismo apellido
  (diferenciados por especialidad). El próximo mensaje es la elección.

## 4. Flujo de un mensaje entrante (orden de resolución en el runner)

Antes de rutear contenido al agente. **Invariante:** los nodos son multi-médico por diseño
(un nodo siempre tiene varios médicos); el flujo se diseña para ese caso. El único
short-circuit de "1 médico" es una guarda defensiva/transitoria (ver §10), no un camino
principal.

1. **`[ID:slug]` presente** (escaneó el QR) → resuelve el médico por slug, setea estado
   `activa` + `medico_id`, re-ancla, y rutea el contenido. Camino feliz, gana siempre.
2. **Escribe un médico** (match por su `numero_personal` en el nodo) → `handleMedico`. Sin
   cambios.
3. **Paciente con pregunta pendiente** (`estado ∈ {esperando_confirmacion,
   esperando_nombre, esperando_seleccion}`) → el mensaje es la **respuesta**:
   - `esperando_confirmacion`: "sí/mismo/sigo" → `activa` con el `medico_id` actual;
     "no/otro/diferente" → transiciona a `esperando_nombre` y pide el apellido.
   - `esperando_nombre`: matchea el apellido (§5) → 0 / 1 / varios.
   - `esperando_seleccion`: toma la opción elegida (número o texto que matchee un
     candidato) → `activa`.
4. **Paciente, sesión `activa` y reciente** (dentro del TTL) → rutea el contenido a
   `medico_id`. Continúa la conversación.
5. **Paciente, sesión `activa` pero vieja** (`last_activity_at` más viejo que el TTL) →
   transiciona a `esperando_confirmacion` y pregunta "¿Seguís con el Dr. X o es con otro
   médico?".
6. **Paciente sin sesión** (nuevo, o sin `medico_id`) y sin marcador → transiciona a
   `esperando_nombre` y pregunta "¿A qué médico le escribís? Escribí su apellido".

Nota de tenant-safety: en un nodo multi-médico, un mensaje que no resuelve nunca se rutea a
un médico "por las dudas" (se mantiene el principio actual de no mezclar tenants); en vez de
`return null` + instructivo, ahora entra en el flujo de desambiguación (§5).

## 5. Desambiguación por nombre

`matchApellido(texto, medicosDelNodo)` — función pura:
- Normaliza (minúsculas, sin acentos/tildes, trim) el texto ingresado y los apellidos.
- Matchea el apellido de los **médicos activos del nodo** (`perfiles.apellido`), por
  contains/startswith normalizado.
- Devuelve la lista de candidatos (0, 1 o varios).

Resolución en el runner:
- **0 coincidencias** → "No encontré ese médico en este número. Revisá el apellido o
  escaneá el QR del consultorio." Se mantiene `esperando_nombre` (re-pide).
- **1 coincidencia** → transiciona a `esperando_confirmacion`: "¿Es el Dr. Juan Moreno
  (Traumatología)? [Sí / No]". (Sí → `activa`; No → `esperando_nombre`.)
- **Varias (mismo apellido)** → transiciona a `esperando_seleccion` y muestra la lista de
  esos 2-4, **diferenciados por especialidad**: "1) Moreno, Juan — Traumatología · 2)
  Moreno, Ana — Clínica". Elige → `activa`.
- Si a un médico le falta `especialidad`, se diferencia por nombre completo + matrícula.

Datos: `perfiles` tiene `nombre`, `apellido`, `especialidad`, `matricula` (verificado). Los
candidatos se acotan a los `medico_id` de las `wa_asignaciones` activas del nodo.

## 6. TTL de sesión

- Default **4 horas de inactividad** (`RUTEO_TTL_MS`), en una constante tuneable. Es lo que
  dispara la re-pregunta del paso 5. Elegido corto a propósito: seguro para "dos médicos el
  mismo día", y como la re-pregunta es un tap, errar corto es barato.
- Se compara `now - last_activity_at > RUTEO_TTL_MS` en hora del servidor (UTC); no depende
  de zona horaria porque es una diferencia de instantes.

## 7. Tras resolver el médico

Cuando el ruteo queda `activa` después de desambiguar, el bot responde "Listo, estás con el
Dr. X 🙌 Contame en qué te puedo ayudar" y el paciente reescribe su pedido. **No** se
bufferea el mensaje original (YAGNI). El `[ID:slug]` (camino feliz) no pasa por este paso:
rutea el contenido directo.

## 8. Modelo de datos

Extender `wa_ruteo_conversacion` (migración aditiva; la tabla ya existe con
`phone_number_id, telefono_paciente, medico_id`):

```sql
alter table public.wa_ruteo_conversacion
  add column if not exists estado text not null default 'activa'
    check (estado in ('activa','esperando_confirmacion','esperando_nombre','esperando_seleccion')),
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists candidatos jsonb;
```

- `estado`: estado de la máquina (§3).
- `last_activity_at`: último mensaje del paciente; base del TTL (§6).
- `candidatos`: cuando el estado es `esperando_seleccion` (o `esperando_confirmacion` de 1
  match), guarda los candidatos ofrecidos `[{ medico_id, etiqueta }]` para resolver la
  respuesta siguiente sin re-matchear. `null` en los demás estados.
- `medico_id` pasa a ser nullable (una sesión puede existir en `esperando_nombre` sin médico
  aún). El acceso sigue por service-role (bypassa RLS), como hoy.

No se crea tabla nueva. `wa_conversaciones`/`wa_contactos` (historial de chat) no cambian.

## 9. Componentes y responsabilidades

| Componente | Responsabilidad | Depende de |
|---|---|---|
| `matchApellido(texto, medicos)` (puro, `src/lib/whatsapp/`) | Normalizar y matchear apellido → candidatos | — |
| `decidirRuteo(estado, entrada)` (puro, `src/lib/whatsapp/`) | Dado estado + mensaje + TTL vencido + resultado de match → próximo estado + acción (rutear / preguntar_confirmacion / preguntar_nombre / listar_seleccion / continuar) | tipos de estado |
| `getMedicosDelNodo(phoneNumberId)` (service) | Traer `{ medico_id, nombre, apellido, especialidad, matricula }` de las asignaciones activas del nodo | `wa_asignaciones` + `perfiles` |
| `wa_ruteo_conversacion` (extendida) + `ruteoConversacion.ts` | Persistir estado/última actividad/candidatos; leer/actualizar la sesión | service-role |
| `resolverIngreso` (`nodos.ts`, modificado) | Orquestar el flujo §4 usando `decidirRuteo`; producir la respuesta o el ruteo | lo de arriba |
| `runner.ts` (modificado) | Enviar los mensajes de desambiguación; al resolver `activa`, continuar al agente | `resolverIngreso` |

## 10. Manejo de errores y edge cases

- **Nodo con 1 médico activo (guarda defensiva, NO el caso normal):** los nodos son
  multi-médico por diseño, pero durante el onboarding un nodo puede tener transitoriamente 1
  solo médico antes de sumar los demás (o el legacy 1:1 `wa_canales`). En ese caso puntual se
  rutea directo sin preguntar. No se diseña alrededor de esto.
- **Apellido sin match (0):** re-pide, no rutea (no mezcla tenants).
- **Especialidad nula:** la etiqueta del candidato usa nombre completo + matrícula.
- **Respuesta ambigua a la confirmación** (ni sí ni no claros): re-pregunta una vez; si
  sigue sin resolver, cae a `esperando_nombre`.
- **`[ID:slug]` durante un estado `esperando_*`:** el marcador gana — resuelve y setea
  `activa` (el paciente reescaneó, es la señal más fuerte).
- **Ventana de 24h de Meta:** las preguntas de desambiguación se envían como respuesta a un
  mensaje entrante del paciente → siempre dentro de la ventana, sin costo de plantilla.
- **Médico escribiendo desde un número no registrado:** sigue el comportamiento actual (no
  matchea como médico); no es alcance de este cambio.

## 11. Testing

- **Unit (puro):** `matchApellido` — 0/1/varios, normalización de acentos y mayúsculas,
  acotado a médicos del nodo.
- **Unit (puro):** `decidirRuteo` — cada transición de §3/§4: activa+reciente→continuar;
  activa+vieja→esperando_confirmacion; sin sesión→esperando_nombre; esperando_confirmacion
  sí/no; esperando_nombre 0/1/varios; esperando_seleccion; `[ID:slug]` gana; nodo de 1
  médico → directo.
- **Integración/E2E (manual, patrón del proyecto):** paciente nuevo sin marcador → pregunta
  nombre → confirma → rutea; paciente conocido tras >4h → "¿mismo o diferente?" → elige otro
  → nombre → especialidad → rutea al segundo médico; verificar que el primer médico NO ve el
  mensaje del segundo.

## 12. No incluido (YAGNI)

- Buffer del mensaje original durante la desambiguación.
- Detección de intención de cambio a mitad de sesión (fuera del TTL).
- Fuzzy matching avanzado (Levenshtein) — se empieza con contains/startswith normalizado; se
  puede mejorar si aparecen typos frecuentes.
- Tabla de sesión separada.
