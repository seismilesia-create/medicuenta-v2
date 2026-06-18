# HANDOFF — MediCuenta V2 — 2026-06-18 (tarde)

> Sesión de **ANÁLISIS + DECISIÓN estratégica** (NO se tocó código). Héctor pasó el cuestionario
> hecho al **contador del Círculo Médico** y **aprobó implementar TODAS las recomendaciones** que
> salieron de ahí. El próximo chat arranca ese backlog — pero **item por item, con brainstorming/PRP**,
> porque varias cosas tocan **compliance real**.

## Estado actual
- **Tarea**: arrancar el **backlog del contador** (modificaciones + oportunidades de facturación).
- **Estado**: planning (backlog aprobado, sin empezar a implementar).
- **Branch**: `feat/whatsapp-recetas-turnos` (= `main`; prod deploya de `main`).
- **Último commit ANTES de este handoff**: `1354077` *Auto-backup 2026-06-18 13:06* (encima de `3e5ac90` *feat(whatsapp): reconocer al médico por su número en nodos compartidos*).

## Contexto: la app ya está madura y EN PRODUCCIÓN
`medicuenta-v2.vercel.app` — arquitectura de nodos WhatsApp (F1-5, E2E validado), panel de onboarding de médicos, bot de turnos/recetas, fix del prefetch de Gmail (`/activar`). Todo documentado en:
- Memorias del proyecto: `project_medicuenta_nodos_whatsapp.md`, `reference_medicuenta_emails_resend.md`, etc.
- HANDOFFs previos en git history (`76822bf` 2026-06-16 y siguientes).
- Commits recientes (2026-06-17/18): `c946f14` *(bajar alarma humana al reservar + cambio de contraseña logueado)*, `3e5ac90` *(reconocer médico por su número en nodos compartidos)*.

---

## ⭐ NUEVA DIRECCIÓN (lo de esta sesión): BACKLOG DEL CONTADOR DEL CÍRCULO

**📄 Documento fuente (LEER PRIMERO):** `/Users/hector/Documents/Claude/Projects/Creacion de App Facturación Salud/respuestas-reunion-contador-circulo.md`
**🧠 Memoria con el backlog destilado:** `project_medicuenta_backlog_contador.md` (en la auto-memory).

### Modificaciones (corto plazo)
1. **Órdenes autorizadas por SISTEMA, no solo papel** — SWISS MEDICAL y otras OS se autorizan 100% por sistema (el médico entra al sistema de la OS); hoy la app solo captura foto del papel. Falta el caso "orden por sistema".
2. **Pre-check anti-débito** — el rechazo #1 es **falta de firma o diagnóstico**. Avisar/bloquear antes de presentar si falta el diagnóstico. *(Barato + alto impacto → buen 1er item.)*
3. **Aranceles time-varying** por OS + tipo (común/especialista/oftalmológica/recertificado) + **recargo % interior**; cambian mes a mes.
4. **Tabla canónica de OS** con estado (activa/suspendida) por mes → alimenta avisos en órdenes/recetas/turnos. (Hoy `obra_social` es texto libre.)
5. **Descartar categoría A/B/C/P** del socio (el contador confirmó que ya no la usan).
6. **Comisión 5% del Círculo** en los cálculos de liquidación.

### Oportunidades grandes
- **A. Control de honorarios Nivel 2** *(el de mayor valor)*: cirugías a módulo abierto/cerrado; el sanatorio puede **inflar gastos y achicar honorarios** ("no hay control"). Registrar la operación N2 con honorarios esperados vs liquidados → **mostrar el gap** → el Círculo puede interceder ante el sanatorio. Toca la feature de **cirugías**.
- **B. Receta electrónica + compliance OSEP** *(⚠️ COMPLIANCE — diseñar con cuidado)*: OSEP **prohíbe cobrar aparte de la orden**. El bot debe **rutear al paciente a la secretaría** para el coseguro (sistema OSEP + token del afiliado), y **solo si el paciente NO quiere ir**, ofrecer pago particular **dejando constancia** (eso protege al médico de que le reclamen por cobrar por fuera de la OS). Modifica el flujo de cobro de recetas del bot.
- **C. B2B app del Círculo + adelantarse a Santiago del Estero** (SdE arma un sistema que unifica las facturaciones de todas las OS). Secuencia que marcó el propio contador: **generar confianza con médicos vía la app → después la app del Círculo** (que vea en tiempo real cuando un médico carga una orden).

## ⚠️ DIRECTIVA CRÍTICA
El backlog es grande y **varias cosas tocan compliance real** (sobre todo **B** receta/OSEP). **NO codear a ciegas.** Ir **item por item**: `brainstorming` → `prp` → `bucle-agetico`. Confirmar prioridad con Héctor antes de arrancar cada uno.

---

## Próximo paso concreto
1. **Verificar el estado REAL de la app** — qué quedó de las "2 pruebas pendientes" del HANDOFF 2026-06-16 (los commits `c946f14`/`3e5ac90` sugieren que el **cambio de contraseña logueado** y mejoras del bot YA se hicieron; confirmar antes de asumir).
2. **Leer** el doc del contador + la memoria del backlog.
3. **Elegir el 1er item con Héctor** (sugerencia: pre-check anti-débito por barato/alto impacto, o control de honorarios N2 por valor) → `brainstorming` → `prp` → implementar.

## Comandos para verificar estado al retomar
```bash
git status        # limpio, feat/whatsapp-recetas-turnos (= main)
git log -5        # último: <hash de este checkpoint> encima de 1354077
curl -i https://medicuenta-v2.vercel.app/c/dr-prueba   # 302 (el bot sigue vivo en prod)
```

## Archivos clave para releer
- `/Users/hector/Documents/Claude/Projects/Creacion de App Facturación Salud/respuestas-reunion-contador-circulo.md` — **EL DOC DEL CONTADOR, empezar acá.**
- Memoria `project_medicuenta_backlog_contador.md` — el backlog destilado con prioridades.
- Por item, los features tocados: órdenes (OCR/captura), nomenclador, **cirugías** (para N2), débitos, liquidaciones, el bot (`src/features/whatsapp/` runner/services/agent) para receta/OSEP.

## Notas contextuales
- Esta sesión **NO tocó código** — solo análisis + decisión.
- Pendiente viejo de seguridad (de hace varios chats, confirmar si sigue): sacar `WA_TOKEN_TMP` de `.env.local` si quedó, y evaluar rotar el token de WhatsApp que pasó por un chat.
- El médico de prueba, la receta de borrado de médico y el fix del prefetch están en el HANDOFF 2026-06-16 (git history) + memorias.
- Había un `Auto-backup 1354077` sin pushear (repo "adelante 1") — se pushea con este checkpoint.
