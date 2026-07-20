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
- Bajo Seismiles IA quedaron **2 WABAs**: `4350905665171500` (número de PRUEBA, Fase 0) + `1012682971379646` (`MediCuenta`, el del bot real). El de prueba se limpia en Fase 3.
- El **PIN que ponga Héctor al registrar → GUARDARLO** (se necesita para futuras migraciones).
