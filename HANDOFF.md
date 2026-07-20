# HANDOFF — MediCuenta V2 — 2026-07-19 (Migración WhatsApp a Seismiles IA · Fase 1 EN CURSO, atascado en "Registrar")

## Estado actual
- **Tarea**: Fase 1 de la migración del WhatsApp Cloud API al portfolio limpio **Seismiles IA** — mover el bot **conservando el número** `+54 9 383 488-4384`. Atascado en el paso final "Registrar".
- **Estado**: **blocked** (esperando que Meta libere/propague el número para poder re-registrarlo).
- **Branch**: `main`
- **Último commit ANTES de este handoff**: `86eadbe` docs: runbook migracion WhatsApp al portfolio Seismiles IA (Fase 0 hecha)

## Archivos modificados esta sesión
- `docs/superpowers/specs/2026-07-19-migracion-whatsapp-seismiles-ia.md`: agregada la sección "Progreso Fase 1" con los IDs nuevos y dónde quedó atascado. **Es la fuente de verdad — leer completo al retomar.**
- `HANDOFF.md`: este archivo (sobrescribió el viejo del 2026-07-16, que era de la tarea #1–#14 ya cerrada).
- *(Sin cambios de código — todo el trabajo de la sesión fue en el navegador/Meta.)*

## Decisiones tomadas (con el "por qué")
- **Rebuild limpio en Seismiles IA + conservar el número** (no mover el WABA viejo) — Meta no deja mover WABAs entre portfolios fácil.
- **Eliminar el número del WABA viejo y re-agregarlo** (no migrar) — no apareció opción de migrar; pre-launch (sin médicos), perder calidad/historial no importa; el perfil nuevo ya está cargado.
- **Modo de trabajo**: Héctor hace TODOS los clicks manuales; Claude solo **mira** (screenshots vía claude-in-chrome, Browser 1) y **guía**. Es más rápido.

## Lo que NO funcionó (no repetir)
- **Agregar el número al WABA nuevo con el número aún en el viejo** → error `#2388002` ("no cumple los requisitos"). Hay que **darlo de baja del viejo primero**.
- **Reintentar apenas se da de baja** → mismo error `#2388002` **cacheado** (el trace id era idéntico). Fix: **cerrar el diálogo, recargar la página (Cmd+R) y esperar unos minutos** a que propague.
- **"Registrar" (poner PIN) apenas re-agregado** → error genérico "Se produjo un error durante el registro. Vuelve a intentarlo". Probó **varios PINs** → NO es el PIN. Es **propagación/cooldown** post-baja.

## Próximo paso concreto
1. **Esperar ~15 min** desde la baja (dar tiempo a que Meta suelte el número).
2. En la pestaña de la **app nueva → Paso 2: Configuración de producción**, **recargar la página (Cmd+R)**.
3. En el número `+54 383 15-488-4384` (estado "No registrado"), tocar **"Registrar"** → poner un **PIN de 6 dígitos y ANOTARLO** → "Registrarse".
4. **Si sigue el error**: borrar esa entrada "No registrado" y re-agregar con **"Agregar número nuevo"** (con el número libre debería mandar el **código por SMS** y verificar bien). El chip del bot está en un teléfono listo para recibir SMS.

## Comandos para verificar estado al retomar
```bash
git status        # esperado: limpio
git log -3        # esperado top: el commit de este checkpoint (WIP(checkpoint): ...)
```

## Archivos clave para releer en la próxima sesión
- `docs/superpowers/specs/2026-07-19-migracion-whatsapp-seismiles-ia.md` — **runbook completo** (mapa, plan por fases, gotchas, TODOS los IDs, progreso Fase 1).
- Memoria `project_medicuenta_meta_reorg` — resumen de la reorganización.

## Notas contextuales
- **IDs clave**: Seismiles IA `business_id 1031852666067009` · app `MediCuenta Bot 1040069988722640` · **WABA nuevo (bot) `MediCuenta 1012682971379646`** · **nuevo `phone_number_id` del bot `1216878824841256`** (el viejo era `1110153015523184`).
- El número se muestra como `+54 383 15-488-4384` → es el MISMO que `+54 9 383 488-4384` (el "15" argentino = el "9" internacional).
- **Browser**: Chrome conectado del usuario (Browser 1). Tabs de la sesión: `849495069` (WhatsApp Manager, WABA viejo ya vacío) · `849495072` (app nueva, Paso 2). Al retomar seguramente hay que reabrir/reconectar tabs.
- El **PIN de 6 dígitos** que ponga Héctor al registrar → **guardarlo** (se pide para futuras migraciones). NO está en este archivo (es secreto).
- El toggle **"Suscribir webhooks"** → NO activar todavía; va en Fase 2.
- **Falta después del registro**: **Fase 2** (configurar webhook: Callback URL de prod + Verify Token; setear `WHATSAPP_APP_SECRET` + `WHATSAPP_VERIFY_TOKEN` nuevos en Vercel; actualizar la tabla de **nodos** en Supabase con el nuevo `phone_number_id 1216878824841256` + token — el phone_number_id CAMBIÓ; probar que el bot responde) y **Fase 3** (limpieza: app dud `5319254603752021`, WABA de prueba `4350905665171500`, y los WABAs/apps basura del portfolio Empresa).
- **Sin secretos en este archivo** (ni PIN, ni tokens, ni `.env`).
