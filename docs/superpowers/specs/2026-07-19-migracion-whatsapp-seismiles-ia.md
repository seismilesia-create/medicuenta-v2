# Migración WhatsApp → portfolio "Seismiles IA" (rebuild limpio)

> Fecha: 2026-07-19. Estado: **pre-launch, sin médicos reales** → buen momento para reorganizar.
> Decisión del usuario: **rebuild limpio en Seismiles IA + conservar el número del bot** `+54 9 383 488-4384`.
> `[VOS]` = lo hace Héctor en Meta (Claude no puede crear apps/WABAs, verificar negocio ni registrar números por él). `[YO]` = lo hace Claude en el código.

## Mapa actual (auditado en vivo 2026-07-19)

**Portfolio "Empresa"** (business_id `110201979883274`, **sin verificar** → límite de 2 números):
- Apps: `Agente WA Demo` (id `1019333590827154`, con system user "agente wa token" → **corre el bot**) + `MediCuenta` (duplicada).
- WABAs:
  - `Asistente MediCuenta` (id `27343280775302597`) → **número bot `+54 9 383 488-4384`, Conectado, calidad Alta, tarjeta VISA \*8043**. ← productivo.
  - `MediCuenta Landing` ×3 → **vacíos** (basura de intentos fallidos).
  - `Test WhatsApp Business Account` → test de Meta.

**Portfolio "Seismiles IA"** → limpio (destino).

Env vars actuales (solo estas dos de WhatsApp, a nivel app): `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. El `phone_number_id` + token de envío viven en la **DB (tabla de nodos)**, no en env.

## Gotchas críticos
1. **PIN de verificación en dos pasos:** para sacar el número del WABA viejo y registrarlo en el nuevo, puede pedir el PIN de 2FA. Si no lo recordás, reseteralo ANTES (en el WABA viejo → número → Verificación en dos pasos). Es lo que más traba una migración de número.
2. **El `phone_number_id` CAMBIA:** el número de teléfono es el mismo, pero al re-registrarlo bajo el WABA nuevo, su `phone_number_id` es NUEVO. Hay que actualizarlo en la DB.
3. **Un número = un WABA:** hay que **sacarlo del viejo** antes de agregarlo al nuevo (queda desconectado un rato → sin usuarios, no pasa nada).
4. **Tokens/secrets:** los valores (App Secret, system user token) NO van al chat. Héctor los carga en Vercel / me los referencia por nombre.

## Plan

### Fase 0 — Preparar el destino (aditivo, NO toca el bot)
1. `[VOS]` Iniciar **verificación del negocio** de Seismiles IA (Business Settings → Información del negocio → Verificar). Es lento (días) → lanzarlo ya, en paralelo. *(Para 2 números se puede empezar sin verificar; la verificación sube límites y calidad para producción.)*
2. `[VOS]` Crear **app nueva** bajo Seismiles IA (developers.facebook.com → Crear app → tipo "Empresa" → asociar al portfolio Seismiles IA). Agregar el producto **WhatsApp**. → anotar **App ID** + **App Secret**.
3. `[VOS]` Crear/confirmar el **WABA nuevo** bajo Seismiles IA (se crea con el setup de WhatsApp de la app).
4. `[VOS]` Crear **System User** en Seismiles IA (Business Settings → Usuarios → Usuarios del sistema) → generar **token permanente** con permisos `whatsapp_business_messaging` + `whatsapp_business_management`, asignado a la app nueva + el WABA nuevo. → este es el token de envío.

### Fase 1 — Mover el número del bot (la parte delicada)
5. `[VOS]` Asegurar/resetear el **PIN de 2FA** del número del bot.
6. `[VOS]` **Sacar** `+54 9 383 488-4384` del WABA viejo (`Asistente MediCuenta`). *(Se desconecta el bot — OK, sin usuarios.)*
7. `[VOS]` **Agregar + verificar** el mismo número en el **WABA nuevo** (SMS o **llamada**). → anotar el **phone_number_id NUEVO**.
8. `[VOS]` **Registrar el número de la landing** `383 512-3373` (ya limpio) en el WABA nuevo. → anotar su **phone_number_id**.

### Fase 2 — Re-cablear la app
9. `[VOS]` En la app nueva → WhatsApp → Configuración → **Webhook**: Callback URL de prod + Verify Token, suscribir `messages`. *(Claude confirma el path exacto del webhook.)*
10. `[VOS]` En **Vercel**: actualizar `WHATSAPP_APP_SECRET` (secret de la app nueva) + `WHATSAPP_VERIFY_TOKEN` (el que hayas puesto en Meta). *(Valores los cargás vos.)*
11. `[YO]` En **Supabase** (tabla de nodos, vía MCP): actualizar el `phone_number_id` del bot + agregar el nodo de la landing. *(Los tokens los cargás vos donde te diga; Claude no toca secrets.)*
12. `[YO/VOS]` Redeploy + re-verificar webhook + **probar que el bot responde**.

### Fase 3 — Limpieza (una vez que el setup nuevo funciona)
13. `[VOS]` Borrar la basura de "Empresa": los 3 WABAs `MediCuenta Landing` vacíos, la app `MediCuenta` duplicada, el `Test WhatsApp Business Account`.

## Cómo lo hacemos
Claude puede **co-manejar el navegador** (navegar + captura + decir dónde clickear) para guiar cada paso, pero **los clicks consecuentes (crear/borrar/registrar/verificar) los hace Héctor**. Arrancar por **Fase 0** (todo aditivo). Pausar antes de la Fase 1.

## Progreso (2026-07-19) — Fase 0 hecha

Portfolio destino **Seismiles IA**: `business_id = 1031852666067009`.

- ✅ App creada: **`MediCuenta Bot`** → `app_id = 1040069988722640`, bajo Seismiles IA.
- ⚠️ El doble-submit (contraseña + reintento) creó un **duplicado dud**: app `MediCuenta Bot` `id = 5319254603752021` ("Tipo: Ninguno") → **BORRAR en Fase 3**.
- ✅ Producto WhatsApp agregado → **WABA nuevo** bajo Seismiles IA: `waba_id = 4350905665171500`.
- ✅ Número de PRUEBA provisionado: `+1 555 191-9769`, `phone_number_id = 1233489659843490` (solo test, NO es el del bot; máx 5 destinatarios).
- Token: **pendiente** — generar **system user token permanente** (Business Settings → Usuarios del sistema) cuando cableemos (Fase 2). El "Generar token" del API Setup es temporal (24 h).

**Siguiente = Fase 1** (mover el bot). Prep antes: **resetear/desactivar el PIN de 2FA** del número del bot `+54 9 383 488-4384` en el WABA VIEJO (`Asistente MediCuenta`, id `27343280775302597`, portfolio Empresa). Luego: sacarlo del viejo → registrarlo en el WABA nuevo vía "Paso 2: Configuración de producción" de la app nueva.

## Progreso Fase 1 (2026-07-19) — EN CURSO, atascado en "Registrar"

Modo de trabajo NUEVO: **Héctor hace todos los clicks manuales**; Claude solo **mira** (screenshots vía claude-in-chrome, Browser 1) y **guía**. Tabs: `849495069` (WhatsApp Manager, WABA viejo, ya vacío) · `849495072` (app nueva → Paso 2 Configuración de producción).

Hecho:
- ✅ **2FA del número del bot estaba DESACTIVADA** en el WABA viejo → NO había PIN; ese temor quedó descartado.
- ✅ **Número dado de baja del WABA viejo** (`Asistente MediCuenta`) → quedó sin números → el número quedó **LIBRE**. **Bot desconectado** (sin médicos, OK). *(La baja tardó unos min en propagar; reintentar antes daba #2388002 cacheado — mismo trace id.)*
- ✅ **Número agregado al WABA NUEVO** `MediCuenta` (`waba_id 1012682971379646`) bajo Seismiles IA, estado **"No registrado"**. Se muestra `+54 383 15-488-4384` (el "15" = el "9", MISMO número).
- ✅ **Nuevo `phone_number_id` del bot: `1216878824841256`** (viejo: `1110153015523184`).

ATASCADO: al tocar **"Registrar"** → pide crear un **PIN de 6 dígitos** (2FA) → al confirmar da **"Se produjo un error durante el registro. Vuelve a intentarlo"**. Probó **varios PINs distintos** → NO es el PIN. Diagnóstico = **propagación/cooldown** post-baja. PLAN: **esperar ~15+ min, recargar (Cmd+R), reintentar "Registrar"** (poner PIN y **ANOTARLO**). FALLBACK: **borrar la entrada "No registrado" y re-agregar** con "Agregar número nuevo" (con el número libre debería mandar el **código por SMS** y verificar). El chip del bot está en un teléfono listo para SMS.

Notas:
- Toggle **"Suscribir webhooks"** → NO activar aún; va en **Fase 2** (tras configurar Callback URL + Verify Token).
- Bajo Seismiles IA quedaron **2 WABAs**: `4350905665171500` (número de PRUEBA, Fase 0) + `1012682971379646` (`MediCuenta`, el del bot real). El de prueba se limpia en Fase 3. *(Corrección 2026-07-20: son 3 — ver WABA fantasma abajo.)*
- El **PIN que ponga Héctor al registrar → GUARDARLO** (se necesita para futuras migraciones).

## Progreso Fase 1 (2026-07-20) — diagnóstico real + re-alta en curso + PLAN B definido

**DIAGNÓSTICO (cierra el misterio de ayer):** "Registrar" no fallaba por propagación — el número quedó **`PENDING` (la verificación OTP nunca se completó)** al re-agregarlo el 19/07. En WhatsApp Manager figuraba **"Pendiente"** y NO existe ningún botón "Verificar" en la UI (se revisó panel del número + menú "Más": solo opciones de llamadas). Un número sin OTP **no se puede registrar jamás** → única salida: borrar la entrada y re-agregar con el flujo completo (el fallback que ya estaba previsto).

- ✅ **Entrada pendiente BORRADA** del WABA del bot (`1012682971379646`) — lista vacía. El `phone_number_id 1216878824841256` murió con ella; al re-agregar habrá OTRO nuevo (anotar el definitivo para Fase 2).
- 🔎 **HALLAZGO — WABA fantasma:** bajo Seismiles IA hay un **TERCER WABA** llamado `MediCuenta`, id **`1539171257694302`** (duplicado nacido del doble-submit del 19/07). Está **VACÍO** (verificado) → **sumar a la lista de borrado de Fase 3**. Ojo al elegir WABA en los flujos: hay dos "MediCuenta"; el del bot es `1012682971379646`.
- ❌ **Re-alta ~5-10 min post-borrado → `#2388002`** ("Error al comprobar si el número cumple los requisitos", trace `WBxP-1472096205-549938811`) en el chequeo previo del diálogo "Agregar número". = cooldown de liberación (igual que ayer). **No se quemó ningún intento de OTP** (falla antes del SMS).
- **Estrategia de reintento:** UN intento por ronda, rondas espaciadas: 10-15 min → 30-60 min → 1-2 h. Cerrar el diálogo y Cmd+R antes de cada reintento (el resultado del chequeo queda cacheado en el diálogo).
- **PLAN B (decidido por Héctor 2026-07-20):** si el número viejo no se libera hoy → **alta con CHIP/NÚMERO NUEVO virgen** y no se espera más. Viable porque es pre-launch (cero médicos, nada impreso). Requisitos del chip: nunca usado con WhatsApp (o borrar la cuenta WA antes desde la app) + recibir SMS. Delta de trabajo vs. plan A: solo actualizar el **número visible** en los links `wa.me` (landing `/c/slug`, QRs) durante el cableado de Fase 2 — el `phone_number_id`/token en nodos y los env de Vercel cambian igual en ambos planes. El número viejo queda en poder de Héctor y se libera solo.

### Desenlace 2026-07-20 mediodía — número viejo WEDGED en el backend → PLAN B GATILLADO

Ronda 2 (post-borrado + re-alta limpia por WhatsApp Manager):
- ✅ Re-alta OK ("Se agregó tu número"; aviso de posible revisión del display name).
- ✅ **Verificación OTP por SMS COMPLETADA** (badge `unverified` → "No registrado"; en Manager "Pendiente" = verificado-sin-registrar). **El `phone_number_id` NO cambió al re-agregar el mismo número al mismo WABA: sigue siendo `1216878824841256`** (corrige la nota de más arriba).
- ❌ "Registrar" (~1 min post-OTP) → error real capturado por interceptor de red: **`"A server error field_exception occured"`** en la mutación GraphQL (el toast genérico lo tapaba).
- Chequeos: 2FA del número **desactivada** (sin PIN viejo → mismatch descartado) · display name "MediCuenta" sin badge de revisión.
- ❌ Workaround "setear PIN ANTES por el Manager" (Verificación en dos pasos → Activar) → **"The PIN could not be changed for +54 9 383 488-4384"** + modal "Error desconocido".
- **CONCLUSIÓN:** dos mutaciones independientes (register + set-PIN) fallan sobre el mismo número → **el número quedó colgado a nivel backend de WhatsApp** (resaca del registro Cloud API viejo que no se liberó limpio al sacarlo del WABA de Empresa). Nada que hacer desde la UI.
- **DECISIÓN: PLAN B en ejecución** → alta de un número/chip NUEVO en el MISMO WABA `MediCuenta 1012682971379646` (banca 2 números; el viejo queda ESTACIONADO sin tocar — ni borrar ni reintentar). Opcional en paralelo: ticket a soporte de Meta por el viejo (trace ids: `#2388002 WBxP-1472096205-549938811` del alta + field_exception del register + PIN-change fail ~12:13 ART).
- ⚠️ Para Fase 2: el `phone_number_id` que va a la DB será el del **número NUEVO** (anotarlo al verificarlo), NO `1216878824841256`.

### Cierre 2026-07-20 (noche) — ✅ FASE 1 COMPLETA: número nuevo REGISTRADO y "Conectado"

**Número del bot (NUEVO): `+54 9 383 402-9027` · `phone_number_id 1134910809713758` · WABA `MediCuenta 1012682971379646`.** Estado final en WhatsApp Manager: **"Conectado"** 🟢. PIN 2FA seteado por Héctor (anotado fuera del repo). El viejo `488-4384` sigue estacionado ("Pendiente", wedged).

Cómo se logró (los 3 bloqueos y sus salidas — GOTCHAS REUSABLES):
1. **Alta**: por WhatsApp Manager → "Agregar número de teléfono" (chip nuevo virgen). El flujo NO pide OTP al agregar (difiere la verificación) → queda "No verificado".
2. **Verificación**: el wizard del dev console ("Paso 2") **muestra UN solo número por WABA (el más viejo)** — el nuevo NUNCA apareció ahí (horas, recargas, rutas alternativas: inútil). La salida: **WhatsApp Manager → panel del número → pestaña Perfil → banner rojo "Verificación del número de teléfono obligatoria" → "Enviar código de verificación"**. (Ojo: el SMS internacional puede tardar/no llegar a un chip recién activado; opción llamada.)
3. **Registro**: imposible por UI (sin fila en Paso 2, no hay botón). La salida: **Graph API Explorer** → `https://developers.facebook.com/tools/explorer/?app_id=1040069988722640` (fijar la app POR URL: en el dropdown hay DOS "MediCuenta Bot" — la real y la dud del doble-submit) → token de usuario con `whatsapp_business_management` + `whatsapp_business_messaging`, acceso concedido SOLO al WABA `1012682971379646` → **POST `1134910809713758/register`** con `messaging_product=whatsapp` + `pin` → `{"success": true}`. (Confirmado además por la IA de Meta como camino oficial cuando la UI no lista el número.)

### Vuelta de tuerca final (misma noche) — ¡el número VIEJO también revivió! AMBOS "Conectado"

Como diagnóstico se probó la misma vía API con el viejo: **POST `1216878824841256/register` → `{"success": true}`** → `+54 9 383 488-4384` quedó **"Conectado" y CONSERVÓ su calificación de calidad ALTA** de su vida anterior. **Conclusión definitiva: el número NUNCA estuvo "wedged" — lo roto era la capa GraphQL de los dashboards de Meta** (botón "Registrar" del dev console + set-PIN del Manager); la Graph API directa registró AMBOS números a la primera. PIN 2FA seteado también en el viejo (anotado por Héctor, fuera del repo). Ticket a soporte: **ya no hace falta**.

**ESTADO FINAL FASE 1 — dos números registrados y conectados en el WABA `MediCuenta 1012682971379646`:**
| Número | phone_number_id | Estado |
|---|---|---|
| `+54 9 383 488-4384` (histórico del bot) | `1216878824841256` | Conectado · **calidad Alta** |
| `+54 9 383 402-9027` (chip nuevo) | `1134910809713758` | Conectado |

**✅ DECISIÓN TOMADA (Héctor, 2026-07-20): el bot queda con el número VIEJO/histórico `+54 9 383 488-4384`** (`phone_number_id 1216878824841256`) — ya figura en nodos y links `wa.me` (no cambia el número visible), conserva la calidad Alta y la continuidad. **El nuevo `402-9027` queda de repuesto / candidato a número de la landing.** OJO: el `phone_number_id` del bot CAMBIÓ igual vs. la DB (era `1110153015523184` en el WABA de Empresa) → la tabla de nodos se actualiza SÍ o SÍ en Fase 2.

## ✅ FASE 2 COMPLETA (2026-07-20 noche → 21 madrugada) — BOT OPERATIVO EN EL SETUP NUEVO

**E2E VALIDADO 2026-07-21 02:41 UTC**: "Hola" al `+54 9 383 488-4384` → webhook (dedupe ✓) → `wa_mensajes` entrante → **agente médico responde** ("¡Hola, Dr. Martínez!…") → saliente por Graph API. **Round-trip ~7 segundos. La migración quedó operativa.**

Qué se cableó:
- **System user** `medicuenta bot sys` (Seismiles IA) con app `MediCuenta Bot` + WABA `1012682971379646` asignados → **token permanente** (en el gestor de Héctor; cifrado en la DB).
- **Vercel**: `WHATSAPP_APP_SECRET` = el de la app nueva (`1040069988722640`) + redeploy. `WHATSAPP_VERIFY_TOKEN`: se REUSÓ el mismo de siempre (una pieza menos).
- **Webhook de la app**: callback `https://medicuenta-v2.vercel.app/api/whatsapp` verificado y activo, campo `messages` ✓ (auto-suscribió varios campos más — inofensivo, el handler los ignora).
- **WABA → app suscripto POR API**: `POST /1012682971379646/subscribed_apps` → `success:true` (el toggle de la UI nunca se tocó; verificable con el GET homónimo).
- **`wa_nodos` actualizado** con el script nuevo [`scripts/update-wa-nodo.mjs`](../../scripts/update-wa-nodo.mjs): `phone_number_id 1216878824841256` + `access_token_cifrado` nuevo (patrón: token en `WA_TOKEN_TMP` de `.env.local` → cifrar → DB; la fila legacy `wa_canales` quedó como estaba, es fallback muerto).

GOTCHAS de la fase (auto-blindaje):
1. **`.env.local` sin guardar** — el clásico: ediciones en el buffer del IDE, mtime del archivo era de JUNIO. Chequear `stat -f '%Sm' .env.local` ANTES de diagnosticar secretos "incorrectos".
2. **App Secret de la app equivocada** (hay DOS "MediCuenta Bot"). Validación sin exponer secretos: `GET /{app_id}?fields=id,name&access_token={app_id}|{secret}` → matchea o no.
3. **Pre-vuelo del token antes de cifrarlo a la DB**: `GET /me` (¿quién soy?) + `GET /{phone_number_id}` (¿veo el número?). Evitó cifrar un token viejo.
4. El **verify token de Vercel no se puede releer** (sensitive) — pero vive en `.env.local`; se valida contra prod con el handshake GET real (`?hub.mode=subscribe&hub.verify_token=...&hub.challenge=ping` → debe devolver el ping).

Higiene post-operación (opcional): vaciar `WA_TOKEN_TMP` en `.env.local` (el token ya vive cifrado en `wa_nodos` + gestor).

Pendientes:
- **FASE 3 limpieza (lista ampliada)**: app dud `5319254603752021` · WABA fantasma `1539171257694302` (¡mismo nombre que el real — verificar ID dígito a dígito!) · WABA prueba `4350905665171500` · en portfolio Empresa: 3× "MediCuenta Landing" (`2811487925887146`, `1319474490345585`, `874636285327896`), app `MediCuenta` duplicada, WABA viejo `Asistente MediCuenta 27343280775302597` y su Test WABA `2040120146582315`.
