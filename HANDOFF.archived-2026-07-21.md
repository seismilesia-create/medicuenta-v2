# HANDOFF — MediCuenta V2 — 2026-07-20 ~23:50 ART (Migración WhatsApp COMPLETA · Fases 0-2 ✅ · queda Fase 3 limpieza)

## Estado actual
- **Tarea**: Migración del WhatsApp Cloud API al portfolio **Seismiles IA** — **TERMINADA Y OPERATIVA** (Fases 0, 1 y 2 completas, E2E validado en prod). Checkpoint de cierre de jornada.
- **Estado**: working (nada roto, nada a medio hacer — el bot responde en prod)
- **Branch**: `main`
- **Último commit ANTES de este handoff**: `e230822` WIP(checkpoint): migración WhatsApp a Seismiles IA — Fase 1 atascada en "Registrar"

## Archivos modificados esta sesión
- `docs/superpowers/specs/2026-07-19-migracion-whatsapp-seismiles-ia.md`: +66 líneas — TODO el desenlace (diagnóstico real, plan B, ambos números "Conectado", Fase 2 completa, gotchas). **Fuente de verdad — leer completo al retomar.**
- `scripts/update-wa-nodo.mjs`: NUEVO — actualiza `wa_nodos` (phone_number_id + token cifrado) leyendo el token de `WA_TOKEN_TMP` en `.env.local`; nunca expone secretos.
- *(Fuera del repo: memoria `project_medicuenta_meta_reorg` + índice MEMORY.md actualizados con el estado final.)*

## Resultado final (lo importante)
- **Bot OPERATIVO** con su número histórico **`+54 9 383 488-4384`** (calidad Alta) en WABA `MediCuenta 1012682971379646` bajo Seismiles IA. E2E validado 2026-07-21 02:41 UTC: "Hola" → agente médico respondió en ~7 s.
- `wa_nodos`: `phone_number_id 1216878824841256` + token nuevo cifrado (system user `medicuenta bot sys`).
- Webhook prod activo (`/api/whatsapp`, campo `messages`) + WABA suscripto a la app vía API + Vercel con `WHATSAPP_APP_SECRET` de la app nueva (`1040069988722640`).
- **Número de repuesto**: `+54 9 383 402-9027` (`phone_number_id 1134910809713758`), Conectado, sin uso — candidato a landing.

## Decisiones tomadas (con el "por qué")
- **El bot conserva el número viejo/histórico** — ya estaba en nodos/links `wa.me` (cero cambios de número visible), calidad Alta, continuidad. El chip nuevo queda de repuesto.
- **`WHATSAPP_VERIFY_TOKEN` se REUSÓ** (mismo valor de siempre) — una pieza menos que rotar; validado contra prod con el handshake GET real.
- **Registro de números y suscripción del WABA: por Graph API directa** (Explorer / curl), no por la UI — ver "lo que NO funcionó".

## Lo que NO funcionó (no repetir en próxima sesión)
- **Los dashboards de Meta para operaciones de números**: el botón "Registrar" (GraphQL `field_exception`), el set-PIN del Manager ("PIN could not be changed"), el wizard "Paso 2" (muestra UN solo número por WABA — cosmético, ignorar), y el toggle "Suscribir webhooks" (nunca se usó). **La Graph API directa funcionó a la primera en TODO** → ante cualquier operación de número/WABA: ir directo a la API.
- **Diagnosticar secretos sin chequear el mtime de `.env.local`** — el archivo estuvo SIN GUARDAR (buffer del IDE) y se testeó data de junio. Primero `stat -f '%Sm' .env.local`.
- **Copiar el App Secret navegando por "Mis apps"** — hay DOS apps "MediCuenta Bot" (la real y la dud) y DOS WABAs "MediCuenta" (el real y el fantasma). SIEMPRE entrar por URL con el ID explícito y validar: `GET /{app_id}?fields=id,name&access_token={app_id}|{secret}`.

## Próximo paso concreto
**FASE 3 — limpieza en Meta** (con calma, el bot ya no depende de nada de esto). Borrar, verificando ID **dígito a dígito** antes de cada click (varios homónimos):
1. Bajo Seismiles IA: app dud `MediCuenta Bot 5319254603752021` ("Tipo: Ninguno") · **WABA fantasma `MediCuenta 1539171257694302`** (VACÍO — ⚠️ mismo nombre que el real `1012682971379646`) · WABA de prueba `4350905665171500`.
2. En portfolio Empresa (`110201979883274`): 3× WABA "MediCuenta Landing" (`2811487925887146`, `1319474490345585`, `874636285327896`) · app `MediCuenta` duplicada · WABA viejo `Asistente MediCuenta 27343280775302597` · su Test WABA `2040120146582315`.
3. Higiene local opcional: vaciar `WA_TOKEN_TMP` en `.env.local`; borrar la fila legacy muerta de `wa_canales` (phone_number_id `1084361314771068`).

**Después de Fase 3 (backlog inmediato, en orden de interés de Héctor):**
- **Landing page** (retomar `project_medicuenta_landing_brand`; prompts en docs/superpowers/specs/2026-07-17).
- **Número `402-9027` como número de la landing** + **idea de Héctor a brainstormear ANTES de implementar**: usarlo también como un **bot con más funciones** (no solo responder la landing — alcance a discutir; pasar por superpowers:brainstorming).

## Comandos para verificar estado al retomar
```bash
git status        # esperado: limpio
git log -3        # esperado top: el commit de este checkpoint (WIP(checkpoint): ...)
# Prueba de vida del bot: mandar "hola" por WhatsApp al +54 9 383 488-4384 → responde el agente.
```

## Archivos clave para releer en la próxima sesión
- `docs/superpowers/specs/2026-07-19-migracion-whatsapp-seismiles-ia.md` — runbook completo con TODOS los IDs, gotchas y la lista exacta de Fase 3.
- Memoria `project_medicuenta_meta_reorg` — resumen del estado final + lecciones.
- `scripts/update-wa-nodo.mjs` — patrón para futuros cambios de token/phone_number_id del nodo.

## Notas contextuales
- **Sin secretos en este archivo ni en el repo**: token permanente en el gestor de Héctor + cifrado en `wa_nodos`; PINs de 2FA de ambos números anotados por Héctor fuera del repo.
- Los E2E manuales pendientes de la rama `mejoras-post-checklist` (agente médico multi-turno, Fase 8, Fase 9 — ver memoria del proyecto) siguen pendientes; no se tocaron hoy.
- El wizard "Paso 2" del dev console va a seguir mostrando un solo número por WABA — es cosmético; el estado real se mira en WhatsApp Manager o por API.
