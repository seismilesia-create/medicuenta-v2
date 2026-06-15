# HANDOFF — MediCuenta V2 — 2026-06-14 (noche, ~22:30 ART)

> Sesión enorme: se implementó la **Arquitectura de Nodos Dinámicos de WhatsApp** completa (PRP-006,
> Fases 1-4), se **mergeó a `main` y se desplegó a producción**, se **registró el número de WhatsApp
> real en Meta** y se **cableó al nodo piloto**. El **E2E quedó bloqueado por config de Vercel** (4 env
> vars que están solo en Preview, no en Production). Mañana se retoma desde ahí. **No queda nada
> creativo pendiente — es pura configuración.**

---

## 0. Estado actual

- **Tarea**: Arquitectura de Nodos Dinámicos WhatsApp (1 número compartido ≤50 médicos + link público
  `/c/slug` + ruteo). F1-F4 hechas, en `main`, desplegadas en prod. Número de producción registrado en
  Meta y cableado al nodo piloto.
- **Estado**: **BLOCKED** — el E2E no corre porque faltan 4 env vars en el entorno **Production** de Vercel.
- **Branch**: `feat/whatsapp-recetas-turnos` (= `main` = `origin/main` = `91f46a2`, todo idéntico).
- **Último commit ANTES de este handoff**: `91f46a2` *feat(nodos-f4): salientes por nodo + compliance Pilar 4 (PRP-006 F4)*.
- **Deploy**: `main` desplegado en producción Vercel (`medicuenta-v2`, deploy Ready). URL estable de prod:
  **`https://medicuenta-v2.vercel.app`**.

---

## 1. 🚧 EL BLOQUEADOR (empezar acá mañana)

`https://medicuenta-v2.vercel.app/c/dr-prueba` devuelve **HTTP 500** en prod (debería ser 302).
**Causa confirmada**: 4 env vars están scopeadas **solo a Preview** (branch `feat/whatsapp-recetas-turnos`),
**no a Production**. El redirect usa `createServiceClient()` (Supabase service role) → sin esa env en
Production, revienta. La app "andaba" porque corría en deploys **Preview**; ahora prod es real y faltan.

**Las 4 env vars a pasar a Production** (en Vercel → proyecto `medicuenta-v2` → Settings → Environment Variables):
1. `ENCRYPTION_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `WHATSAPP_APP_SECRET`
4. `WHATSAPP_VERIFY_TOKEN`

(Ya están en "All Environments": `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY` — esas OK.)

**Cómo arreglarlo (3 opciones, elegir una):**
- **(A) UI de Vercel** — editar cada una de las 4 → **sacar el filtro de branch** (la X del recuadro
  "feat/whatsapp-recetas-t...") → en Environments elegir **"All Environments"** → Save. *(Ojo: con el
  filtro de branch puesto, la UI NO deja agregar Production — hay que sacarlo primero.)*
- **(B) CLI** — desde el repo: `vercel env add <NAME> production` para cada una, tomando el valor del
  `.env.local`. **El guardrail de seguridad bloquea que Claude lo haga** (mueve secretos a prod); lo
  corre Héctor, o se agrega una Bash permission rule para habilitarlo a Claude.
- **(C) Re-crear** — "Add Environment Variable" con valor copiado del `.env.local`, scope "All Environments".

**Después de arreglar las env vars:**
1. **Redeploy de prod** (las env vars no se aplican solas): `vercel --prod` desde el repo, o un push a `main`, o "Redeploy" en el dashboard.
2. **Retest**: `curl -i https://medicuenta-v2.vercel.app/c/dr-prueba` → debe pasar de **500 → 302** (Location a `wa.me/...`).

---

## 2. Lo que se hizo esta sesión (todo commiteado + en prod)

- **F1** `f808391` — fundación de datos: tablas `wa_nodos`, `wa_asignaciones`, `wa_ruteo_conversacion` (RLS), servicios `nodos.ts` + `ruteoConversacion.ts`, seed del nodo piloto.
- **F2** `994454a` — redirect público `GET /c/[slug]` → 302 a `wa.me` con `[ID:slug]`. Lógica pura `lib/whatsapp/linkNodo.ts` (+tests). Verificado en vivo (302 OK con número de prueba).
- **F3** `f2d8880` — resolución de identidad por nodo en el ingreso (`runner.ts`): `resolverIngreso` = (a) `[ID:slug]` → re-ancla ruteo, (b) ruteo persistido, (c) fallback legacy `wa_canales`, (d) null. Cierra el "HUECO" del informe.
- **F4** `91f46a2` — salientes por nodo (`resolverSaliente`) + compliance Pilar 4 ("costo de gestión", no "venta de medicamento") en `systemPrompt.ts` y título de MercadoPago en `tools.ts`.
- **Merge a `main`** (fast-forward, 155 commits — incluye también el trabajo de `dev/gaby`, que ya estaba contenido en esta branch) → **deploy a prod en Vercel**.
- **Meta / número de producción**: registrado el número real en la WhatsApp Cloud API (app existente), nombre "Asistente MediCuenta", categoría "Medicina y salud", verificado por SMS, PIN de 2FA seteado (lo guardó Héctor), webhook suscripto.
- **Token permanente** generado (System User "MediCuenta API", permisos `whatsapp_business_messaging` + `whatsapp_business_management`, sin vencimiento) → encriptado con la `ENCRYPTION_KEY` del proyecto → guardado **cifrado** en `wa_nodos.access_token_cifrado` del nodo piloto. (Se verificó que la `ENCRYPTION_KEY` local == prod descifrando el token de prueba.)

---

## 3. IDs y valores clave (SIN secretos)

| Qué | Valor |
|---|---|
| URL estable de prod | `https://medicuenta-v2.vercel.app` |
| Meta App ID | `1556981509178874` |
| WABA (cuenta WhatsApp Business) | `27343280775302597` |
| **phone_number_id PRODUCCIÓN** | `1110153015523184` |
| Número producción (display) | `+54 383 15-488-4384` |
| `numero_whatsapp` cargado en el nodo (para `wa.me`) | `543834884384` (SIN el 9 — **validar en E2E** si `wa.me` abre bien, si no probar `5493834884384`) |
| Nodo piloto (`wa_nodos.id`) | `ac72b38a-53ea-4fec-8e4a-280c04dcc0df` |
| Slug del piloto | `dr-prueba` → `https://medicuenta-v2.vercel.app/c/dr-prueba` |
| Médico piloto | `admin@medicuenta.com` · `924014ac-fb0a-4d9c-9028-49535e5e2e60` (es superadmin) |
| System User Meta | "MediCuenta API" · `61590718924782` |
| Número de PRUEBA (legacy, sigue en `wa_canales`) | `phone_number_id 1084361314771068` |
| Proyecto Supabase | `eylcrxhpccwobipcjzal` (migraciones por MCP `apply_migration`) |

---

## 4. Próximos pasos concretos (en orden)

1. **Pasar las 4 env vars a Production en Vercel** (ver §1, opción A/B/C) y **redeployar**.
2. **Retest**: `curl -i https://medicuenta-v2.vercel.app/c/dr-prueba` → esperar **302** (no 500).
3. **Confirmar/poner el webhook de Meta** apuntando a **`https://medicuenta-v2.vercel.app/api/whatsapp`**
   (Meta → app `1556981509178874` → Configurar webhooks → Callback URL). El endpoint ya responde 403 a un
   GET sin params = nuestra app OK; falta confirmar que el webhook apunte a ESA URL estable.
4. **E2E real**: abrir `https://medicuenta-v2.vercel.app/c/dr-prueba` en un celular → se abre WhatsApp con el
   número de producción → mandar el mensaje → el bot debe **identificar al médico (dr-prueba) y responder**.
   Verificar que se cree la fila en `wa_ruteo_conversacion` y que un 2º mensaje (sin `[ID]`) mantenga el médico.
5. Si el redirect abre mal el `wa.me` (número), cambiar `wa_nodos.numero_whatsapp` a `5493834884384` (con 9) y reprobar.

---

## 5. Lo que NO funcionó / gotchas (no repetir)

- **Deploys recientes eran todos Preview** → prod no tenía las env vars de WhatsApp/Supabase-service/Encryption → `/c/` 500. (Este es EL bloqueador, §1.)
- **La UI de Vercel no deja cambiar el scope** de una var que tiene **filtro de branch** sin sacar el filtro primero (la X), después recién "All Environments".
- **El guardrail de seguridad bloqueó (correctamente) a Claude** dos veces: (a) escribir el token en texto plano a un archivo, (b) copiar secretos del `.env.local` a Vercel prod. → Estas dos las tiene que hacer **Héctor** (o habilitar con una Bash permission rule).
- **Browser control (Chrome MCP)**: la ventana de automatización **no comparte la sesión logueada** de Vercel (pide login aparte). Para usarla, Héctor tiene que loguearse en esa ventana primero.
- **Número argentino en Meta va SIN el 9** (el tilde verde de Meta lo confirma). El "15" es prefijo de discado, no va.
- **iPhone 16 Pro Max US (modelo `MYW63LL/A`) es solo eSIM** (sin ranura física). La línea Claro se activó en un Android prestado (por eso recibe el SMS de verificación ahí).
- **Número de prueba de Meta NO se promueve a producción** — por eso se registró un número propio nuevo.

---

## 6. ⚠️ Pendientes de seguridad/limpieza (hacer mañana)

- **Sacar `WA_TOKEN_TMP` de `.env.local`** — fue temporal para encriptar el token; ya no se usa (el token vive cifrado en `wa_nodos`). El `.env.local` está gitignoreado, pero igual conviene borrar esa línea.
- **El token permanente apareció en el chat de esta sesión** → por higiene, considerar **revocarlo y regenerarlo** (Meta → Configuración del negocio → Usuarios del sistema → MediCuenta API → "Revocar tokens"), y re-cablearlo con el mismo flujo de encriptado. El token NO está en este HANDOFF ni en git.

---

## 7. Comandos para verificar estado al retomar

```bash
cd ~/proyectos/Medicuenta-V2.0
git status                 # limpio; branch feat/whatsapp-recetas-turnos = main = 91f46a2
git log -3 --oneline       # último: 91f46a2 feat(nodos-f4)
npm test                   # 230 verdes
npm run build              # OK
# el bloqueador:
curl -i https://medicuenta-v2.vercel.app/c/dr-prueba   # HOY: 500 ; OBJETIVO tras arreglar env vars: 302
vercel env ls production   # ver si ENCRYPTION_KEY / SERVICE_ROLE / WHATSAPP_* ya están en Production
```

---

## 8. Archivos clave para releer

- `.claude/PRPs/prp-nodos-dinamicos-whatsapp.md` — el PRP completo (objetivo, fases, modelo de datos, aprendizajes). **Empezar por acá.**
- `src/features/whatsapp/services/nodos.ts` — `resolverIngreso` (entrada), `resolverSaliente` (salida), lecturas de nodos.
- `src/features/whatsapp/services/ruteoConversacion.ts` — ruteo (nodo,paciente)→médico.
- `src/lib/whatsapp/linkNodo.ts` (+ `.test.ts`) — lógica pura del link/marcador.
- `src/app/c/[slug]/route.ts` — el redirect que hoy da 500 en prod.
- `src/features/whatsapp/runner.ts` — ingreso del webhook (usa `resolverIngreso`).
- `supabase/migrations/20260614_fase1_nodos_dinamicos.sql` — esquema de nodos.

---

## 9. Notas contextuales

- Memoria del proyecto actualizada: `project_medicuenta_nodos_whatsapp.md` (en la auto-memory) tiene la decisión + estado.
- Diferido a "fase de escalamiento" (NO en este PRP): flota de 10-15 nodos, failover automático, monitoreo de quality rating, reverse-lookup `numero_personal→médico` para nodos multi-médico.
- El orquestador (cron de email, ya en prod) necesita `RESEND_API_KEY` + `CRON_SECRET` en prod para los avisos; si faltan, falla solo sin afectar el bot. No es prioridad.
- Para la cobranza de recetas por el bot (parte del flujo), prod necesitará `PUBLIC_BASE_URL` apuntando a `https://medicuenta-v2.vercel.app` — verificar cuando se pruebe el cobro.
