# HANDOFF — MediCuenta V2 (Fase 3C en curso) — 2026-06-12

## Estado actual
- **Tarea**: **Fase 3C en curso.** Lo que NO depende de Google ya está hecho; falta el espejo de
  Google Calendar (bloqueado por credenciales del dueño).
- **Branch**: `feat/whatsapp-recetas-turnos` — **pusheada** (`origin/...`). Último commit `89acf64`.
- **Gates**: `npm test` (187 verdes) · `npm run typecheck` · `npm run build` — todos OK. `npm run lint` roto (deuda, no es gate).

## Fase 3 — mapa de avance
- **3A** (agenda estilo Google Calendar, asistente de turnos) ✅ — pendiente prueba en vivo del dueño.
- **3B** (secretaria con acceso delegado, RLS por `puede_acceder_consultorio`) ✅ — pendiente prueba en
  vivo (gabriel@seismilesia.com en build de producción). Ver `scripts/test-rls-secretaria.sql`.
- **3C**:
  - **Shell adaptativo celular/web** ✅ (`e04e73d`). Médico en celular = asistente puro (sin nav; la
    agenda la ve por su Google Calendar, turnos se editan solo desde la compu). Detección sin parpadeo
    a prueba de rotación (puntero coarse + lado corto ≤600). `src/app/layout.tsx` (script) + globals.css
    (`.only-phone`/`.only-web`) + `src/app/(main)/layout.tsx`.
  - **Correlación turno→orden + control 15 min** ✅ (`a436968`). Al facturar con DNI, propone fecha/hora
    reales del turno atendido (un click → `ordenes.turno_id`). Aviso si dos órdenes del día quedan a
    <15 min. Migración `20260612_fase3c_correlacion.sql`. Lógica pura: `src/lib/consultorio/correlacion.ts`.
    Acción: `src/actions/consultorio-correlacion.ts`. UI: `SugerenciaTurnoCard` en `NuevaOrdenForm`.
  - **Bitácora del agente formalizada** ✅ (`89acf64`, spec §10). El agente deja traza estructurada por
    turno (tools, ok, cobros, preview) en `wa_bitacora`; el médico la lee en Config → "Actividad del
    asistente". Lógica pura: `src/lib/whatsapp/resumenPasos.ts` + `src/lib/consultorio/bitacora.ts`.
    Lectura: `bitacoraService.ts`. Es la semilla del futuro orquestador (§12).
  - **Pulido desktop §9.3** — mayormente YA estaba (sidebar agrupada+fija, dashboards en grilla, tablas
    con columnas en desktop). Quedan detalles chicos (autofocus en /ordenes/nueva, separadores sidebar,
    desglose de montos) — el dueño priorizó la bitácora sobre estos.
  - **Espejo Google Calendar** ⏳ BLOQUEADO — necesita que el dueño cree proyecto Cloud + credenciales
    con **iaceleratech@gmail.com** (Gmail de pruebas definido). Tablas pendientes: `gcal_conexiones`,
    `wa_turnos.gcal_event_id`. Ver memoria `fase3c-google-cuenta-pruebas`.

## Modelo operativo / comercial (definido por el dueño 2026-06-12) — ver memoria `modelo-operativo-onboarding`
- **Héctor provee y es dueño de TODOS los números de WhatsApp** (los configura él); el servicio se cobra
  completo, números incluidos. El médico solo aporta su Gmail + datos. Ya soportado por la arquitectura
  (canal por médico en `wa_canales`, manejado por service-role).
- **Pendiente (Héctor)**: documento operativo de onboarding (a redactar sobre la 1ª instalación real),
  contrato legal, y **definir 2 tipos de suscripción** (falta qué los diferencia — features vs volumen).
  El proyecto ya tiene `add-payments` (Polar) como base.

## Pruebas en vivo pendientes (el dueño las hace al final, en build de producción)
`npm run build && npm start` (NO dev — el middleware solo corre en producción en Next 16.2.3):
1. **3B**: gabriel@seismilesia.com (secretaria) ve solo Consultorio, da turnos, NO ve facturación; rutas
   médico-only → redirigen a /agenda. Médico invita/revoca desde Config → Secretaria.
2. **3A**: agenda mes/semana/día.
3. **3C celular**: abrir como médico en un teléfono real → debe verse SOLO el asistente.
4. **3C correlación**: cargar orden por foto con DNI de un paciente con turno → debe aparecer la sugerencia.
5. **3C bitácora**: Config → "Actividad del asistente" muestra lo que hizo el asistente.

## Lo que NO funcionó (no repetir)
- **`next dev` NO ejecuta el middleware** (Next 16.2.3, ningún motor). Guards de rol SOLO en build de
  producción. Matar dev zombies con `pkill -9 -f "next dev"; pkill -9 -f "next-server"` antes de relanzar.
- **`REVOKE ... FROM anon, authenticated` no basta** (grant a PUBLIC) — usar `FROM PUBLIC` + `GRANT TO service_role`.
- (Vigentes: Haiku NO como agente conversacional · token de Meta vence en horas · `npm run lint` roto.)

## Datos de prueba (proyecto eylcrxhpccwobipcjzal)
- Médico: **admin@medicuenta.com** `924014ac-fb0a-4d9c-9028-49535e5e2e60` (con turnos: Quinteros DNI 3452167,
  Figueroa/Martinez DNI 23309087).
- Secretaria: **gabriel@seismilesia.com** `9e473632-...` (vínculo 'activa' con admin).

## Comandos para verificar al retomar
```bash
cd ~/proyectos/Medicuenta-V2.0
git status                 # limpio salvo next-env.d.ts (ruido del build)
npm test                   # 187 verdes
npm run build              # OK, "ƒ Proxy (Middleware)" presente
```
