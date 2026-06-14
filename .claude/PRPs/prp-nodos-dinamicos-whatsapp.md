# PRP-006: Arquitectura de Nodos Dinámicos para WhatsApp (cluster-based routing)

> **Estado**: APROBADO (2026-06-14) — ejecución de Fase 1 en curso. Ajuste aprobado: el marcador embebido es el **slug**, no el UUID del médico.
> **Fecha**: 2026-06-14
> **Proyecto**: MediCuenta V2.0
> **Fuente**: `~/Downloads/Informe_Arquitectura_Nodos_WhatsApp_MediCuenta.pdf` (v1.0, Jun 2026)

---

## Objetivo

Migrar el modelo de telefonía de WhatsApp de **"1 número por médico"** (tabla `wa_canales`, relación 1:1) a **"1 nodo/número compartido por hasta 50 médicos + link público estable por médico + ruteo dinámico de conversación"**. Esta fundación desacopla tres conceptos hoy fusionados — **identidad del médico**, **número físico de WhatsApp (nodo)** y **punto de contacto que ve el paciente (link)** — de forma que crecer la base de médicos sea agregar filas, no aprovisionar líneas.

Alcance de este PRP: **fundación migrable + piloto con 1 nodo**, ejecutable AHORA en pre-launch (sin conversaciones que migrar). Se difieren a fases posteriores la flota de 10-15 nodos, el failover automático y el monitoreo de quality rating.

## Por Qué

| Problema | Solución |
|----------|----------|
| El modelo actual exige 1 número de WhatsApp verificado por médico; a 500-700 médicos es logística y financieramente inviable (informe §3) | Un **nodo** (1 número virtual) atiende hasta 50 médicos; 500-700 médicos = 10-15 nodos en vez de cientos de líneas |
| El paciente hoy guardaría/usaría el número del médico; si ese número cae (bloqueo de Meta, falta de saldo), se rompe el canal de ese médico sin recuperación | El paciente solo conoce un **link propio y estable** (`/c/dr-perez`); el número detrás es infraestructura intercambiable. Cambiar el nodo no toca el material del médico |
| Un bloqueo de Meta sobre una línea hoy deja sin servicio a ese médico, sin redundancia | Con nodos compartidos + link estable, reasignar 50 médicos a un nodo de reserva es cambiar una FK (failover, fase posterior) |
| El bot habla de "pago para recibir tu receta" — roza la política de Salud/Farmacéuticos de Meta (riesgo de baneo de cuenta) | Plantillas alineadas al **Pilar 4**: honorario profesional / gestión administrativa, nunca venta de medicamento (informe §4.4) |

**Valor de negocio**: convierte un costo que crecería **lineal con la cantidad de médicos** (1 línea = 1 médico) en uno que crece **escalonado cada 50 médicos** (1 nodo = 50 médicos). Es el desbloqueo de infraestructura que permite la adopción masiva (Catamarca → Argentina → otros profesionales) sin renegociar telefonía en cada salto. Reduce además el riesgo de suspensión de cuenta de Meta, que a escala es un riesgo existencial para el canal de atención.

## Qué

### Criterios de Éxito (de este PRP — piloto + fundación)

- [ ] Existe una tabla `wa_nodos` (flota de números virtuales con estado/capacidad/quality) y una tabla `wa_asignaciones` (médico → nodo + slug público único).
- [ ] El médico del piloto está asignado a 1 nodo activo y tiene un slug público (`dr-<algo>`).
- [ ] `GET /c/[slug]` resuelve el slug → nodo activo y responde `302` a `https://wa.me/<numero_nodo>?text=<saludo+[ID:slug]>` (URL-encoded). El marcador embebe el **slug**, NO el UUID del médico (no se filtra el id de `auth.users` al canal público).
- [ ] Existe una tabla de **ruteo de conversación** `(phone_number_id, telefono_paciente) → medico_id` que persiste el vínculo a partir del 1.er mensaje (cierra el HUECO del informe).
- [ ] El ingreso del webhook (`runner.ts`) resuelve `medico_id` así: (a) `[ID:slug]` en el texto (resuelto slug→médico, re-ancla el ruteo) → (b) ruteo de conversación existente → (c) fallback conversacional ("¿a qué consultorio corresponde?"). El resto del pipeline sigue recibiendo `medico_id` explícito, sin cambios.
- [ ] El envío saliente (entrega de receta, webhook de MP, toma humana del panel) usa el **nodo del médico**, no su número personal, resolviendo por `medico_id`.
- [ ] Las plantillas/copys de cobro reflejan el Pilar 4 (honorario/gestión, no venta de medicamento).
- [ ] `npm run typecheck` y `npm run build` pasan; el flujo link → WhatsApp → bot identifica al médico correcto end-to-end con 1 nodo.

### Comportamiento Esperado (Happy Path)

**Aprovisionamiento (admin / pre-launch):** se da de alta un nodo (`wa_nodos`: número virtual verificado en Meta, estado `activo`, capacidad 50). Se asigna el médico del piloto al nodo (`wa_asignaciones`: `medico_id`, `nodo_id`, `slug_publico='dr-perez'`).

**Paciente entra por el link:**
1. El paciente abre `https://<app>/c/dr-perez` (impreso en receta, tarjeta, redes).
2. El route handler valida el slug → nodo activo, construye el texto `"Hola, quiero hacer una consulta [ID:dr-perez]"` (el marcador ES el slug) y responde `302` a `https://wa.me/<numero_nodo>?text=<urlencoded>`.
3. WhatsApp abre con el mensaje pre-cargado; el paciente presiona Enviar.

**El bot recibe el 1.er mensaje en el nodo compartido:**
4. El webhook llega con `phone_number_id` = el del nodo (compartido por 50 médicos) y `from` = teléfono del paciente.
5. El runner intenta ruteo de conversación `(phone_number_id, from)`; no existe (es el 1.er mensaje).
6. El runner extrae `[ID:<slug>]` del texto, resuelve `slug → medico_id` por `wa_asignaciones`, **valida** que ese médico esté asignado al nodo por el que entró (`wa_nodos.phone_number_id`), y **persiste** el ruteo `(phone_number_id, from) → medico_id`. Limpia el marcador `[ID:...]` del texto antes de pasarlo al agente.
7. El pipeline continúa idéntico al actual: `ensureContacto` → `ensureConversacion` → agente con tools de cobro/turnos/consultorio, todo con `medico_id` explícito.

**Mensajes siguientes del mismo paciente:**
8. El `[ID:...]` ya no viaja (el paciente escribe libre). El runner resuelve `medico_id` por el ruteo persistido en el paso 6. Continuidad garantizada.

**Salientes (entrega de receta pagada, aviso de MP, toma humana):** se resuelve el **nodo** del médico por `medico_id` y se envía desde el `phone_number_id` del nodo (con su token), no desde el número personal del médico.

---

## Contexto

### Estado actual del código (investigado)

**El cambio se concentra en la resolución de identidad en el ingreso; el resto del pipeline ya lleva `medico_id` explícito.** Hay exactamente **dos** funciones que hoy traducen "número ↔ médico", y son toda la superficie a modificar:

- **Entrada (inbound)** — `src/features/whatsapp/services/canales.ts` → `getCanalByPhoneNumberId(db, phoneNumberId)`. Hoy: `SELECT ... FROM wa_canales WHERE phone_number_id = ? AND estado='conectado'` (1:1). Llamada única en `src/features/whatsapp/runner.ts:50`. Devuelve `CanalResuelto { medicoId, phoneNumberId, accessToken, numeroPersonal }`.
- **Salida (outbound)** — `getCanalByMedicoId(db, medicoId)` en el mismo archivo. Llamada desde:
  - `src/app/api/mercadopago/webhook/route.ts:55,60` (avisar/entregar al confirmarse un pago).
  - `src/actions/consultorio-conversaciones.ts:63` (toma humana desde el panel).

**`runner.ts` (ingreso, líneas 44-68):** `parseIncomingMessage(payload)` → `getCanalByPhoneNumberId(...)` → `esRemitenteMedico()` decide rama médico/paciente → `handleMedico` / `handlePaciente`. **A partir de tener `canal.medicoId`, NADA más mira el número**: `ensureContacto`, `ensureConversacion`, `addMensaje`, el agente y sus tools (`buildPacienteTools/Turnos/Consultorio`) reciben `medicoId` directo. Esto confirma que el blast radius del cambio es el bloque de resolución de identidad, no el pipeline.

**Lo que llega del webhook** — `src/lib/whatsapp/parse.ts` → `IncomingMessage { phoneNumberId, from, messageId, contactName?, type, text?, mediaId?, filename? }`. **Crítico:** en un nodo compartido, `phoneNumberId` ya NO identifica al médico, y `[ID:...]` solo puede venir embebido en `text` del 1.er mensaje. → **De aquí sale el HUECO del informe (ver abajo).**

**`esRemitenteMedico`** — `src/lib/whatsapp/clasificar.ts` compara `from` contra `canal.numeroPersonal` (el número personal del médico). Con un nodo, el `numeroPersonal` es por-médico, no por-canal → la rama médico debe resolverse **después** de saber qué médico es (por ruteo/ID), no antes.

**Identidad del médico** — no hay tabla `medicos`/`profiles` con nombre comercial. El nombre/especialidad del médico vive en `wa_config_agente (nombre_medico, especialidad)` (ver `runner.ts:218`). → el `slug_publico` necesita su propia casa: la tabla `wa_asignaciones`.

**Aprovisionamiento de canales** — **no existe ningún `INSERT` a `wa_canales` en la app** (verificado): los canales se siembran manualmente. Las otras dos referencias a `wa_canales` son solo lectura (`panelService.ts:544` health-check del panel; `consultorio-conversaciones.ts` comentario). Implicación: el piloto puede sembrarse a mano (1 nodo, 1 asignación) sin construir UI de onboarding en este PRP.

**Webhook entrante** — `src/app/api/whatsapp/route.ts` (runtime nodejs): verifica firma de Meta, dedupe por `wamid` en `wa_eventos_webhook`, siempre responde 200. **No cambia** con nodos.

**Esquema actual** — `supabase/migrations/20260609_whatsapp_fase0.sql`: `wa_canales` (1:1 médico↔phone_number_id), `wa_contactos (UNIQUE(medico_id, telefono))`, `wa_conversaciones`, `wa_mensajes`, `wa_config_agente`, `wa_eventos_webhook`. Todas con RLS `auth.uid() = medico_id`.

### El HUECO del informe (decisión de arquitectura clave de este PRP)

El informe (§4.2, §6) propone el `[ID:847]` incrustado en el `?text=` del link, y asume que con eso "el bot sabe con qué médico iniciar". **Eso solo cubre el 1.er mensaje.** El `[ID]` viaja en el cuerpo del primer mensaje; **a partir del 2.º mensaje el paciente escribe libre y el marcador ya no está**. En un nodo compartido por 50 médicos, sin un registro persistente no se puede saber a cuál de los 50 pertenece la conversación en curso.

→ **Este PRP cierra ese hueco con una tabla de ruteo de conversación** `(phone_number_id, telefono_paciente) → medico_id`, escrita en el 1.er mensaje y leída en todos los siguientes. Es la pieza que el informe no contempla y sin la cual el modelo de nodos no funciona en la práctica conversacional.

> Nota de diseño: hoy `wa_contactos` tiene `UNIQUE(medico_id, telefono)` — un mismo teléfono YA puede mapear a varios médicos (un paciente que va a 2 médicos). La tabla de ruteo respeta esto: la clave es `(phone_number_id, telefono_paciente)`, y como dos médicos del mismo nodo comparten `phone_number_id`, hay que decidir el comportamiento cuando el mismo paciente escribe a dos médicos del **mismo** nodo (ver Gotchas). Se resuelve con el `[ID]` del link re-anclando el ruteo en cada entrada que traiga marcador.

### Referencias

- `src/features/whatsapp/runner.ts` — ingreso; punto de inserción de la resolución de identidad (líneas 44-68).
- `src/features/whatsapp/services/canales.ts` — las 2 funciones a evolucionar (`getCanalByPhoneNumberId`, `getCanalByMedicoId`).
- `src/lib/whatsapp/parse.ts` / `clasificar.ts` — forma del mensaje entrante y clasificación médico/paciente.
- `src/features/whatsapp/services/entrega.ts` — salientes que consumen `CanalResuelto` (deben tomar el nodo).
- `src/app/api/whatsapp/route.ts` — webhook (sin cambios, referencia de contrato).
- `supabase/migrations/20260609_whatsapp_fase0.sql` — esquema base y patrón RLS por `medico_id`.
- `app/(main)` y `app/admin` — App Router con route groups; la raíz `/` está tomada (`app/page.tsx`). Rutas dinámicas existentes viven namespaced (`ordenes/[id]`, etc.). → el redirect público debe ir en **`/c/[slug]`**, no en la raíz `/[slug]` (chocaría con el App Router).
- Informe §4 (4 pilares), §6 (modelo de datos + handler de redirect), §7 (riesgos), §8 (hoja de ruta), §9 (glosario).

### Arquitectura Propuesta

```
src/
├── app/
│   └── c/
│       └── [slug]/
│           └── route.ts            # GET → 302 a wa.me/<nodo>?text=...[ID:medicoId]
│                                    # (namespaced: NO en la raíz, choca con App Router)
└── features/whatsapp/
    └── services/
        ├── nodos.ts                # CRUD/lectura de wa_nodos + wa_asignaciones
        ├── ruteoConversacion.ts    # resolver/persistir (phone_number_id, telefono) → medico_id
        └── canales.ts              # EVOLUCIONA: resuelve por nodo, no por wa_canales 1:1
                                     #   - resolverIngreso(phoneNumberId, from, text) → identidad
                                     #   - getNodoByMedicoId(medicoId) → nodo para salientes
```

`CanalResuelto` se mantiene como contrato hacia el pipeline (`{ medicoId, phoneNumberId, accessToken, numeroPersonal }`), pero su origen pasa de `wa_canales` a `wa_nodos` + `wa_asignaciones` + ruteo. El pipeline aguas abajo no se entera.

### Modelo de Datos

> `wa_nodos` ≈ 80% de la `wa_canales` actual: número, token cifrado, estado. Lo nuevo: capacidad, contador de médicos, quality_rating, y que el número es **compartido** (no `UNIQUE` por médico). **Decisión tomada:** `wa_canales` **coexiste sin tocarse** durante el piloto (hay lecturas que aún la referencian, p.ej. `panelService.ts:544`); su deprecación es una limpieza posterior, fuera de este PRP. No se mezcla migración de datos con cambio de arquitectura.

```sql
-- Flota de números virtuales (nodos). Sistema-only (service-role); sin dueño médico.
CREATE TABLE wa_nodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL UNIQUE,        -- el id de Meta del número del nodo
  numero_whatsapp TEXT NOT NULL,               -- E.164, el wa.me/<este>
  display_phone_number TEXT,
  access_token_cifrado TEXT NOT NULL,          -- mismo cifrado que wa_canales
  proveedor TEXT,                              -- 'zadarma' | 'twilio' | ...
  estado TEXT NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo','restringido','en_revision','reserva')),
  capacidad_max INT NOT NULL DEFAULT 50,
  medicos_activos INT NOT NULL DEFAULT 0,      -- denormalizado para asignación
  quality_rating TEXT,                         -- 'high'|'medium'|'low' (Meta API; fase posterior)
  verificado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wa_nodos ENABLE ROW LEVEL SECURITY;
-- Tabla de infraestructura: sin política para médicos. Acceso por service-role (bypassa RLS).
-- (RLS habilitada y sin policies = denegado para clientes autenticados; correcto.)

-- Asignación médico → nodo + link público estable.
CREATE TABLE wa_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nodo_id UUID NOT NULL REFERENCES wa_nodos(id),
  slug_publico TEXT NOT NULL UNIQUE,           -- 'dr-perez' → /c/dr-perez
  numero_personal TEXT NOT NULL,               -- para clasificar remitente médico vs paciente
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id)                           -- 1 asignación activa por médico (este PRP)
);
CREATE INDEX idx_wa_asignaciones_medico_id ON wa_asignaciones(medico_id);
CREATE INDEX idx_wa_asignaciones_slug ON wa_asignaciones(slug_publico);
ALTER TABLE wa_asignaciones ENABLE ROW LEVEL SECURITY;
-- El médico lee SU asignación (para mostrar su link); escribe el sistema.
CREATE POLICY "wa_asignaciones_select" ON wa_asignaciones FOR SELECT USING (auth.uid() = medico_id);

-- Ruteo de conversación: cierra el HUECO del informe (el [ID] solo viaja en el 1.er mensaje).
CREATE TABLE wa_ruteo_conversacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL,               -- nodo por el que entró
  telefono_paciente TEXT NOT NULL,             -- normalizado (normalizeRecipient)
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone_number_id, telefono_paciente)  -- 1 médico activo por (nodo, paciente)
);
CREATE INDEX idx_wa_ruteo_medico ON wa_ruteo_conversacion(medico_id);
ALTER TABLE wa_ruteo_conversacion ENABLE ROW LEVEL SECURITY;
-- Sistema-only (service-role). El médico podría leer las suyas si hiciera falta para el panel.
CREATE POLICY "wa_ruteo_select" ON wa_ruteo_conversacion FOR SELECT USING (auth.uid() = medico_id);
```

**Handler de redirect** (`/c/[slug]`):
```
GET /c/:slug
  1. SELECT n.numero_whatsapp
       FROM wa_asignaciones a JOIN wa_nodos n ON n.id = a.nodo_id
      WHERE a.slug_publico = :slug AND a.activo AND n.estado = 'activo'
     (no hace falta medico_id acá: el marcador del texto ES el slug)
  2. text = `Hola, quiero hacer una consulta [ID:${slug}]`
  3. 302 → https://wa.me/${numero_whatsapp}?text=${urlencode(text)}
  (slug inexistente/sin nodo activo → 404 o página "consultorio no disponible")
```

**Resolución de identidad en ingreso** (reemplaza `getCanalByPhoneNumberId` en `runner.ts:50`):
```
resolverIngreso(phoneNumberId, from, text):
  1. slugEmbebido = extraer [ID:<slug>] de text   (presente solo cuando el paciente entró por el link)
     si slugEmbebido:
        resolver slug → medico_id por wa_asignaciones, validando que su nodo (wa_nodos)
          tenga phone_number_id == este y estado 'activo'
        UPSERT wa_ruteo_conversacion (phone_number_id, normalize(from)) = medico_id   (re-ancla en cada entrada por link)
        limpiar el marcador [ID:...] del texto antes de pasarlo al agente
        → usar ese medico_id
  2. si NO hay slug embebido:
        ruteo = SELECT medico_id FROM wa_ruteo_conversacion
                 WHERE phone_number_id = ? AND telefono_paciente = normalize(from)
        si ruteo → usar ruteo.medico_id
  3. si ni slug ni ruteo → fallback: responder "¿A qué consultorio corresponde tu mensaje?"
        con las credenciales del NODO (resuelto por phone_number_id en wa_nodos), sin romper
  → devolver CanalResuelto del NODO (token+phone_number_id del nodo) + medico_id + numero_personal (de wa_asignaciones)
```

---

## Blueprint (Assembly Line)

> Solo FASES. Las subtareas se generan al entrar a cada fase (mapear contexto → generar subtareas → ejecutar) con `/bucle-agentico`.

### Fase 1: Fundación de datos (nodos, asignaciones, ruteo)
**Objetivo**: Migración Supabase con `wa_nodos`, `wa_asignaciones`, `wa_ruteo_conversacion` (RLS según patrón existente), tipos TS regenerados, y servicios de lectura/escritura (`nodos.ts`, `ruteoConversacion.ts`). Seed manual del piloto: 1 nodo activo + 1 asignación con slug.
**Validación**: las 3 tablas existen con RLS habilitada; `npm run typecheck` pasa; consulta de seed devuelve el nodo y la asignación del médico piloto.
**✅ COMPLETADA (2026-06-14)**: migración `20260614_fase1_nodos_dinamicos.sql` aplicada (MCP) + espejo versionado; seed piloto (`dr-prueba` → nodo reusando el canal real `1084361314771068`, `numero_whatsapp` placeholder); servicios `nodos.ts` (`getNodoActivoBySlug`, `getAsignacionBySlug`, `getNodoByPhoneNumberId`, `getNodoByMedicoId`) y `ruteoConversacion.ts` (`getRuteoMedico`, `upsertRuteoMedico`); typecheck OK; advisor `wa_nodos` INFO intencional.

### Fase 2: Redirect público `/c/[slug]`
**Objetivo**: Route handler `GET /c/[slug]` que resuelve slug → nodo activo y devuelve `302` a `wa.me/<numero>?text=<saludo+[ID:slug]>` URL-encoded; slug inválido → 404/página amable. Namespaced bajo `/c/` (no raíz).
**Validación**: `curl -i /c/dr-<piloto>` devuelve 302 con `Location` correcto y `text` bien encodeado; un slug inexistente devuelve 404; no rompe el App Router (`npm run build`).
**✅ COMPLETADA (2026-06-14)**: ruta `src/app/c/[slug]/route.ts` (302 → wa.me con [ID:slug]) + lógica pura `src/lib/whatsapp/linkNodo.ts` (+ test, 7 casos) + página "consultorio no disponible". Verificado EN VIVO (`npm start`): slug inexistente y placeholder → 404; con número válido → 302 a `wa.me/<n>?text=...%5BID%3Adr-prueba%5D`. Middleware NO gatea `/c/` (allowlist de `protectedPaths`). build OK (`ƒ /c/[slug]`).

### Fase 3: Resolución de identidad en el ingreso (runner)
**Objetivo**: Evolucionar `canales.ts` (`resolverIngreso` por nodo + ruteo + `[ID]`, y limpieza del marcador) y reconectar `runner.ts:50` para usarla; la clasificación médico/paciente pasa a hacerse **después** de resolver el médico. Persistir ruteo en el 1.er mensaje; leerlo en los siguientes. Fallback conversacional si no hay identidad.
**Validación**: simular webhook del 1.er mensaje con `[ID:...]` → se crea fila en `wa_ruteo_conversacion` y el agente arranca con el médico correcto; 2.º mensaje sin `[ID]` → resuelve por ruteo; mensaje sin ruteo ni `[ID]` → fallback sin crashear. `npm run typecheck` pasa.
**✅ COMPLETADA (2026-06-14)**: `resolverIngreso` en `nodos.ts` (NO canales.ts, para evitar ciclo de imports) — orden (a) `[ID:slug]` → re-ancla ruteo · (b) ruteo persistido · (c) fallback legacy · (d) null. Helpers puros `extraerIdSlug`/`limpiarMarcadorId` en `linkNodo.ts` (+4 tests). `runner.ts:49-54` reconectado (marcador removido de `incoming.text`; la clasificación médico/paciente YA ocurría después de resolver → sin reorder). Censo: 1 médico, ya sobre nodo → híbrido trivialmente seguro. **typecheck + 230 tests + build OK.** Live E2E de la resolución → Fase 5 (con número real, sin ensuciar prod).

### Fase 4: Salientes por nodo + compliance Pilar 4
**Objetivo**: `getCanalByMedicoId` (y por ende entrega de receta, webhook MP, toma humana) resuelve el **nodo** del médico vía `wa_asignaciones` → envía desde el `phone_number_id`/token del nodo, no del número personal. Ajustar copys de cobro al Pilar 4 (honorario/gestión administrativa, no venta de medicamento) en system prompt / textos salientes.
**Validación**: entrega de una receta pagada del médico piloto sale por el número del nodo; revisar que ningún texto saliente diga "comprá/pagá tu medicamento/remedio"; `npm run build` pasa.
**✅ COMPLETADA (2026-06-14)**: `resolverSaliente` (nodo → fallback legacy) en `nodos.ts`; reapuntados los 3 call-sites (MP webhook entrega + aviso, toma humana del panel). Compliance Pilar 4 **aprobado por Héctor**: línea de cobro → "El costo de gestión de tu receta es $X" (`systemPrompt.ts`); título de MercadoPago → "Gestión de receta médica" sin nombre del medicamento (`tools.ts`); heading → "GESTIÓN Y ENTREGA". typecheck + 230 tests + build OK. Entrega real por el nodo se verifica en Fase 5 (número real).

### Fase 5: Validación Final (E2E con 1 nodo)
**Objetivo**: Flujo completo link → WhatsApp → bot → cobro/entrega con 1 nodo y el médico piloto, end-to-end.
**Validación**:
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` exitoso
- [ ] E2E manual/Playwright: `/c/slug` → wa.me → 1.er mensaje identifica médico → 2.º mensaje mantiene médico por ruteo → entrega de receta sale por el nodo
- [ ] Todos los Criterios de Éxito cumplidos
- [ ] Riesgo #1 (registrabilidad de números VoIP en WhatsApp Cloud API) validado o documentado como bloqueante para escalar (ver Gotchas)

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece con cada error encontrado durante la implementación. El conocimiento persiste.

### 2026-06-14: El proyecto NO usa tipos generados de Supabase
- **Hallazgo**: no existe `database.types.ts` ni `SupabaseClient<Database>`; los servicios (`canales.ts`, etc.) usan `SupabaseClient` genérico + cast manual de cada fila.
- **Decisión**: `nodos.ts` y `ruteoConversacion.ts` siguen ese patrón (cast manual). La subtarea "regenerar tipos TS" quedó **N/A** (no hay archivo de tipos que actualizar). NO introducir tipos generados en este PRP (sería un cambio transversal fuera de alcance).
- **Aplicar en**: cualquier servicio nuevo de WhatsApp/Supabase en este proyecto.

### 2026-06-14: Reuso del token cifrado sin re-cifrar
- **Hallazgo**: para sembrar el nodo piloto con el canal real, se copia el blob `access_token_cifrado` directo de `wa_canales` (misma key AES-256-GCM), sin descifrar/recifrar.
- **Aplicar en**: migraciones de datos que muevan tokens entre tablas (nodos ↔ canales).

### 2026-06-14: `wa_nodos` dispara `rls_enabled_no_policy` (INFO) — es intencional
- **Hallazgo**: el advisor de Supabase marca `wa_nodos` (RLS on, sin policy) igual que `orquestador_avisos`. Es **esperado y correcto**: tabla de infraestructura accedida solo por service-role. No agregar policy.

### 2026-06-14: El middleware usa allowlist, no default-deny → `/c/` es público sin cambios
- **Hallazgo**: `middleware.ts` matchea todo salvo assets, pero `updateSession` (`proxy.ts`) solo redirige a `/login` las rutas de `protectedPaths` (allowlist). `/c/` no está → pasa sin auth. No hubo que tocar el matcher.
- **Aplicar en**: futuras rutas públicas (links, webhooks server-to-server) — no requieren excluirse del middleware, salvo que se quiera evitar el `getUser()` por performance.

### 2026-06-14: Censo de canales — 1 solo médico, ya sobre nodo → híbrido sin migración
- **Hallazgo**: hay un único `wa_canales` en prod (el piloto) y ya tiene asignación de nodo. No hay médicos legacy que migrar; el fallback a `wa_canales` queda solo como red de seguridad.

### 2026-06-14: Lado MÉDICO en nodos multi-médico (DIFERIDO)
- **Hallazgo**: en el piloto, el médico escribiéndole a su nodo se resuelve por el fallback legacy (el nodo reusa su canal 1:1, mismo `phone_number_id`). En un nodo con 50 médicos eso NO alcanza: haría falta un reverse-lookup `numero_personal → médico` (entre los asignados al nodo) antes del fallback, y `wa_ruteo_conversacion` para el lado paciente.
- **Aplicar en**: la fase de escalamiento (nodos multi-médico), NO en este PRP.

### 2026-06-14: `resolverIngreso` vive en `nodos.ts`, no en `canales.ts`
- **Hallazgo**: el PRP decía "evolucionar canales.ts", pero `resolverIngreso` necesita llamar a `getCanalByPhoneNumberId` (canales.ts) como fallback → ponerlo en nodos.ts evita un ciclo de imports (nodos → canales, una sola dirección). `canales.ts` queda intacto (legacy).

---

## Gotchas

> Cosas críticas a tener en cuenta ANTES de implementar.

- [ ] **RIESGO #1 — Registrabilidad de números VoIP en WhatsApp Cloud API.** Validar ANTES de comprometer la flota: no todos los DIDs VoIP pasan la verificación de Meta (SMS suele fallar en VoIP; preferir verificación por **llamada de voz**; proveedores citados: Zadarma, Twilio). Si el número del piloto no se registra, el modelo entero se cae. Es el primer experimento a correr, idealmente antes/durante Fase 1. El informe (§7) recomienda certificar al menos 2 proveedores para no depender de uno.
- [ ] **El `[ID]` solo viaja en el 1.er mensaje.** No asumir que está en cada mensaje (es el error implícito del informe). Toda continuidad de conversación depende de `wa_ruteo_conversacion`. Limpiar el marcador `[ID:...]` del texto ANTES de pasarlo al agente y antes de persistir el mensaje (no debe ensuciar el historial ni filtrarse en respuestas).
- [ ] **El redirect va en `/c/[slug]`, NO en la raíz `/[slug]`.** Un `[slug]` dinámico en la raíz del App Router colisiona con rutas existentes y con `app/page.tsx`. Confirmado: la app usa route groups `(main)`/`(auth)` y la raíz está tomada.
- [ ] **Mismo paciente, dos médicos del MISMO nodo.** Como la clave de ruteo es `(phone_number_id, telefono_paciente)` y dos médicos del mismo nodo comparten `phone_number_id`, un paciente que escribe a dos médicos de ese nodo colisiona en la misma fila. Mitigación: cada entrada que traiga `[ID]` (vía link) **re-ancla** el ruteo a ese médico (UPSERT). Documentar el caso borde: si el paciente escribe libre sin re-entrar por el link, sigue con el último médico ruteado. (Distribuir médicos entre nodos reduce la probabilidad.)
- [ ] **`esRemitenteMedico` depende del número personal del médico, que ahora es per-asignación, no per-canal.** La rama médico/paciente debe decidirse DESPUÉS de resolver `medico_id` (y traer su `numero_personal` desde `wa_asignaciones`), no antes. Hoy se decide antes (con `canal.numeroPersonal`).
- [ ] **`wa_nodos` es tabla de infraestructura: NO debe tener dueño médico ni política de SELECT para clientes.** RLS habilitada + sin policy = denegado a clientes autenticados; el acceso es por service-role (igual que las inserciones de `wa_eventos_webhook` hoy). El token cifrado del nodo nunca debe poder leerse desde el cliente.
- [ ] **`wa_contactos` ya admite el mismo teléfono en varios médicos** (`UNIQUE(medico_id, telefono)`). El ruteo no rompe esto; son ejes distintos (contacto por médico vs. ruteo por nodo).
- [ ] **Cifrado del token del nodo:** reutilizar `descifrar()` de `@/lib/crypto/encryption` (mismo esquema que `wa_canales.access_token_cifrado`). No introducir un esquema nuevo.
- [ ] **`numero_whatsapp` (E.164 para `wa.me`) vs `phone_number_id` (id de Meta para enviar/recibir) son distintos.** El link usa el número; el webhook y el envío usan el `phone_number_id`. `wa_nodos` guarda ambos.
- [ ] **Diferidos a fases posteriores (NO en este PRP):** flota de 10-15 nodos, failover automático por webhook `account_update` de Meta, panel de monitoreo de quality rating, balanceo dinámico de carga entre nodos, y el runbook de incidentes para conversaciones abiertas en un nodo que pasó a `restringido`.

## Anti-Patrones

- NO poner el redirect en la raíz `/[slug]` (rompe el App Router).
- NO confiar en que `[ID]` llega en cada mensaje (solo el 1.º) — usar la tabla de ruteo.
- NO exponer `wa_nodos` ni su token a clientes (sin policy de SELECT para médicos).
- NO romper el contrato `CanalResuelto` hacia el pipeline aguas abajo (médico_id explícito): cambia el ORIGEN, no la forma.
- NO comprometer la flota de nodos antes de validar la registrabilidad VoIP en Meta (Riesgo #1).
- NO usar lenguaje de "venta de medicamento/remedio" en textos del bot (Pilar 4 / política de Salud de Meta).
- NO crear un esquema de cifrado nuevo; reutilizar el de `wa_canales`.
- NO construir UI de onboarding de nodos en este PRP (el piloto se siembra a mano).

---

*PRP APROBADO (2026-06-14). Ejecución de Fase 1 en curso vía bucle-agético.*
