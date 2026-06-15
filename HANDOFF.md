# HANDOFF — MediCuenta V2 — 2026-06-15 (tarde)

> Sesión de **validación E2E** de la Arquitectura de Nodos WhatsApp (PRP-006) en **PRODUCCIÓN**.
> El bloqueador del handoff anterior (4 env vars en Vercel) **ya estaba resuelto** al empezar.
> El bot no respondía por **OTRA causa** (config de Meta), que se diagnosticó y arregló.
> **Resultado: el bot funciona de punta a punta en producción** — flujos médico y paciente validados.
> **No hubo cambios de código esta sesión** (diagnóstico + config en Meta + memoria).

---

## 0. Estado actual

- **Tarea**: Validación E2E del bot WhatsApp (nodos dinámicos PRP-006) en producción.
- **Estado**: **working — E2E core VALIDADO**. Quedan pulidos NO bloqueantes (B y C abajo).
- **Branch**: `feat/whatsapp-recetas-turnos` — idéntica a `origin/main` salvo este `HANDOFF.md`; el código F1-F4 **ya está en producción** (`origin/main`).
- **Último commit ANTES de este handoff**: `f18ef65` *WIP(checkpoint): nodos F1-F4*.
- **Prod**: `https://medicuenta-v2.vercel.app` (Vercel deploya `origin/main`).

---

## 1. Qué se hizo esta sesión

- **Diagnóstico sistemático de "el bot no responde".** Se descartó que fuera el código o las env vars.
- **CAUSA RAÍZ (arreglada por Héctor en Meta):** el **Callback URL del webhook en Meta** apuntaba a una
  **URL de prueba** (Preview/túnel), no a producción → Meta entregaba los mensajes (✓✓) pero **nunca
  hacía POST** a `/api/whatsapp`. **Fix:** Callback URL = `https://medicuenta-v2.vercel.app/api/whatsapp`
  + verify token = `WHATSAPP_VERIFY_TOKEN` + suscribir el campo **`messages`**.
- **E2E VALIDADO en prod:**
  - Flujo **MÉDICO** (desde el nº del médico): `precio 8000` ✅, `recetas` → resumen ✅.
  - Flujo **PACIENTE** (desde OTRO número): el bot se presenta como *"asistente virtual del Dr. Héctor
    Martínez, cirujano general"* y ofrece turno/receta ✅.
  - Ruteo de identidad por nodo escribiendo en `wa_ruteo_conversacion` ✅.
- Se confirmó que el **dedupe por `wamid`** (índice UNIQUE `wa_eventos_webhook_wamid_key`) funciona:
  2 menús = 2 mensajes distintos, NO duplicación.
- **QR directo** `whatsapp://send?...` probado: abre la app **sin navegador** y **sigue ruteando**
  (el marcador `[ID:slug]` viaja en el texto).
- Auto-memory actualizada: `project_medicuenta_nodos_whatsapp.md` → F5 E2E validado + gotcha del Callback URL.

---

## 2. Decisiones tomadas (con el porqué)

- **No se mergea nada**: el código F1-F4 ya está en `origin/main` (producción). `feat` solo difiere en este `HANDOFF.md`.
- **QR directo vs `/c/slug`**: el directo (`whatsapp://`) gana UX (abre la app sin navegador) y mantiene el
  ruteo; pierde número-dinámico + analytics de escaneo. **Decisión de producto pendiente** (para el piloto el directo alcanza).

---

## 3. Lo que NO funcionó / gotchas (no repetir)

- Asumir que el bloqueador eran las env vars: **ya estaban OK**. El bloqueador real era el **Callback URL de Meta**.
- **✓✓ (entregado) NO garantiza que el webhook procese**: si el Callback URL está mal, Meta entrega al número
  pero no POSTea. Diagnóstico decisivo: `wa_eventos_webhook` en 0 + **cero `POST /api/whatsapp`** en
  `vercel logs --since` a pesar de ✓✓.
- **Probar el flujo paciente desde el nº del MÉDICO no sirve**: el bot lo identifica como médico (`esRemitenteMedico`).
  Para probar paciente hay que usar OTRO número.

---

## 4. Próximo paso concreto (plan B → C)

- **B) Display name en Meta**: configurar/forzar que aparezca **"Asistente MediCuenta"** en vez del número pelado
  (WhatsApp Manager → número → verified name). Es lo más visible para la confianza del paciente.
- **C) Flujos profundos**: probar **cobro real de una receta** (MercadoPago) + **agendar un turno** end-to-end.

---

## 5. Comandos para verificar estado al retomar

```bash
git status                 # limpio, en feat/whatsapp-recetas-turnos
curl -i https://medicuenta-v2.vercel.app/c/dr-prueba          # 302 -> wa.me
# enviar un WhatsApp NUEVO al link y ver que llegue el POST:
vercel logs medicuenta-v2.vercel.app --since 10m | grep -i whatsapp   # esperar POST /api/whatsapp 200
```

---

## 6. Archivos clave para releer

- `.claude/PRPs/prp-nodos-dinamicos-whatsapp.md` — el PRP completo.
- `src/app/api/whatsapp/route.ts` — webhook (verificación de firma + dedupe por wamid).
- `src/features/whatsapp/runner.ts` — ramas médico/paciente.
- `src/features/whatsapp/services/nodos.ts` — `resolverIngreso` (a: marcador, b: ruteo persistido, c: legacy, d: null).

---

## 7. IDs y notas contextuales (SIN secretos)

| Qué | Valor |
|---|---|
| phone_number_id PRODUCCIÓN | `1110153015523184` |
| Número (display) | `+54 383 15-488-4384` (WhatsApp lo muestra como `+54 9 3834 88-4384`) |
| `numero_whatsapp` del nodo (wa.me) | `543834884384` (SIN el 9; entrega ✓✓ OK) |
| Nodo piloto | `ac72b38a-53ea-4fec-8e4a-280c04dcc0df` · slug `dr-prueba` |
| Médico piloto | `admin@medicuenta.com` · `924014ac-fb0a-4d9c-9028-49535e5e2e60` |
| Proyecto Supabase | `eylcrxhpccwobipcjzal` |

- **Pendientes de seguridad** (del handoff anterior, siguen abiertos): sacar `WA_TOKEN_TMP` de `.env.local`;
  rotación del token permanente **diferida** hasta que Héctor anuncie "vamos a prod".
- El **display name** y el **menú-en-cada-mensaje del médico** son pulidos de UX, no bugs.
- Hay un desarrollo grande pendiente fuera de este PRP: **Fase 5 — Suscripciones** (que el médico pague por MediCuenta).
- **Nota de repo**: el `main` LOCAL está desincronizado (commits "Auto-backup"). No afecta producción; ordenar en algún momento.
