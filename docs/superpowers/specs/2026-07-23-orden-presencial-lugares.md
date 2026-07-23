# Orden de consulta presencial + lugares de atención + fix de entrega

**Fecha:** 2026-07-23
**Rama:** `feat/orden-presencial-lugares`
**Reemplaza (parcialmente):** `2026-07-06-orden-consulta-osep-receta-design.md` — la Fase A derivaba al chat con la secretaria; eso queda sin efecto.

## 1. Contexto y objetivo

La vía "saldar la receta con una orden de consulta" derivaba la conversación a la secretaria
(`necesita_humano` + `bot_pausado` + "te va a atender la secretaria por este mismo chat").
Héctor lo bajó por dos razones operativas:

1. La secretaria atiende a **varios pacientes y varios médicos a la vez** — chatear uno por uno
   se presta a confusiones y errores.
2. La orden de consulta hay que **completarla y FIRMARLA**. Por WhatsApp no se puede.

**Objetivo:** el trámite pasa a ser **presencial**. El bot le informa al paciente el horario de
atención (= el del médico, `wa_horarios`) y **dónde** concurrir, y le explica que la completa y
la firma ahí con la secretaria — o que si ya la tiene emitida en otro lado la lleve igual,
aclarando que es para liberar una receta electrónica, **no** para atenderse. La liberación desde
el panel no cambia.

Se suman dos cosas que el flujo necesitaba:

- **Lugares de atención** (no existía ningún modelo de lugar físico en la app).
- **Fix de la entrega** (bug bloqueante, ver §4) y manejo real de la ventana de 24 h.

## 2. Decisiones (Héctor, 2026-07-23)

| Decisión | Alternativa descartada |
|---|---|
| Lugares = **días por lugar**, sin franjas propias. La hora sale de `wa_horarios` (ya es por weekday) | Franjas horarias por lugar: duplica la fuente de horarios y arrastra al motor de turnos |
| **Sin señal** a la secretaria cuando el paciente anuncia que va | Chip "va a traer orden" en la bandeja: más ruido, y queda viejo si el paciente no va |

La secretaria encuentra la conversación con el buscador por nombre/teléfono que ya existe en
`/conversaciones`.

## 3. Multi-secretaria (lo que Héctor pidió verificar)

Ya estaba soportado: `equipo_consultorio` tiene `UNIQUE (medico_id, secretaria_email)` — un par,
no un único registro por médico. Un médico puede tener N secretarias y una secretaria N médicos.
`getConfig` las trae todas y la UI ya las lista. **Cero cambios.**

## 4. Bug bloqueante corregido (pre-existente)

`liberarPorOrdenConsulta` no escribía `paciente_telefono` (solo lo hacía `vincularPago`, al
generar el link de MercadoPago). Consecuencia en la vía pura de orden de consulta:

- `entregarReceta` corta en `if (!receta.paciente_telefono) return false` → **el PDF no salía**.
- `listarPagadasSinEntregar` filtra por teléfono → el reintento al próximo mensaje **tampoco la
  encontraba**. La receta quedaba `pagada` para siempre.
- El panel decía igual "✅ el bot ya se la envió" (`liberarReceta` devolvía `{ok:true}` fijo).

**Fix:** `liberarReceta` recibe `conversacionId`, resuelve el contacto de esa conversación y
estampa el teléfono **antes** de liberar (`estamparDestinoEntrega`).

⚠️ **Gotcha del formato:** el canónico es `normalizeRecipient(...)` = `54…` **sin el 9**, que es
con el que el runner llama a `entregarPendientes`. `wa_contactos.telefono` guarda el crudo
`549…`: estamparlo tal cual matchearía 0 filas en silencio.

El estampado va **antes** de liberar a propósito: si falla, la receta sigue `pendiente_pago` y se
reintenta, en vez de quedar liberada y sin destino. Es condicional (`paciente_telefono IS NULL`),
así que no pisa el candado anti-secuestro de `vincularPago`; si la receta ya estaba tomada por
otro número, el panel avisa a dónde fue el PDF.

## 5. Ventana de 24 h

Sin plantillas HSM (decisión vigente: no se paga por reabrir conversaciones). Con el teléfono
estampado, el mecanismo que ya existía alcanza:

1. Se libera con la ventana cerrada → `sendWhatsAppDocument` falla → `revertirEntrega` deja la
   receta en `pagada`.
2. El paciente escribe cualquier cosa → `entregarPendientes` (runner, en cada entrante) la
   encuentra y **entrega el PDF al instante**.

El panel ahora dice la verdad: `liberarReceta` devuelve `entregada` y la UI distingue "enviada"
de "liberada, sale cuando el paciente escriba" (que es justo el guion que le sirve a la
secretaria cuando el paciente llega tarde con la orden). Con la ventana cerrada, además,
pre-avisa antes de confirmar.

## 6. Modelo de datos

`supabase/migrations/20260727_lugares_atencion.sql` (aplicada en prod):

```sql
create table public.wa_lugares_atencion (
  id, medico_id → auth.users,
  nombre text not null,        -- "Sanatorio Pasteur"
  direccion text, consultorio text, piso text,   -- opcionales, texto libre
  dias smallint[] not null default '{}',          -- 0=domingo..6=sábado
  created_at, updated_at,
  check (dias <@ array[0,1,2,3,4,5,6])
);
```

RLS espeja `wa_dias_particulares`: médico CRUD (`auth.uid() = medico_id`), SELECT delegado
(`puede_acceder_consultorio`). La secretaria **edita** vía server actions con `ctxOperativo` +
service-role, como el resto de la config operativa.

Sin franjas por lugar en V1; agregarlas después es aditivo (columnas o tabla hija).

## 7. Flujo end-to-end

1. Paciente pide la receta → el bot ofrece **pagar** o **vía obra social**.
2. Elige obra social (o pregunta dónde/cómo tramitar) → `solicitar_orden_consulta` **a cualquier
   hora**: compone server-side el instructivo presencial con horarios y lugares reales. Ya **no**
   marca `necesita_humano` ni pausa el bot.
3. El paciente va al consultorio, completa y firma la orden con la secretaria.
4. La secretaria abre la conversación en `/conversaciones` → "Liberar receta por orden de
   consulta" → DNI → elige la receta → N° de orden → confirmar. El modal muestra **a qué WhatsApp
   va el PDF** antes de confirmar.
5. Ventana abierta → PDF al toque ("✅ Orden de consulta recibida. Acá está tu receta."). Ventana
   cerrada → sale solo cuando el paciente escriba.

## 8. Archivos

**Fase 1 — entrega/24 h**
- `src/features/whatsapp/services/recetasService.ts`: + `estamparDestinoEntrega`.
- `src/actions/consultorio-recetas.ts`: `liberarReceta` con `conversacionId`, estampado, evento
  `receta_liberada_orden_consulta`, devuelve `{ ok, entregada, telefonoDestino }`.
- `src/features/whatsapp/services/entrega.ts`: caption según `forma_pago`.
- `.../conversaciones/liberar-receta.tsx` + `hilo-panel.tsx`: destino visible, pre-aviso de
  ventana cerrada, resultado honesto, aviso de "otro número".

**Fase 2 — lugares**
- `supabase/migrations/20260727_lugares_atencion.sql`
- `src/lib/consultorio/diasSemana.ts` (+ test) — `formatearDias`/`ordenarDias` compartidos.
- `src/lib/consultorio/lugaresAtencion.ts` (+ test) — formateos y `lugaresDelDia`.
- `src/features/whatsapp/services/lugaresService.ts` — `getLugares`.
- `src/actions/consultorio-config.ts` — `agregarLugarAtencion` / `editarLugarAtencion` /
  `quitarLugarAtencion` (`ctxOperativo`), `ConfigVista.lugares`.
- `src/features/consultorio/services/panelService.ts` — `getConfig` trae lugares.
- `.../config/lugares-config.tsx` (nuevo) + sección en `config-view.tsx`.

**Fase 3 — vía presencial**
- `src/lib/consultorio/horariosTexto.ts` (+ test) — `formatearHorariosSemana`, `recortarHora`.
- `src/features/whatsapp/agent/ordenPresencial.ts` (+ test) — `componerMensajeOrdenPresencial`.
- `src/features/whatsapp/agent/tools.ts` — `solicitar_orden_consulta` reescrita (sin derivación).
- `src/features/whatsapp/agent/systemPrompt.ts` — vía OS presencial; opt `lugares`; fuera
  `secretariaDisponible` (queda solo en el ctx de tools). **Bloque B4 intacto.**
- `src/features/whatsapp/runner.ts` — carga lugares y los inyecta al prompt.
- `src/features/whatsapp/agent/runAgentTurn.ts` — anti-mudez para la tool nueva.
- `src/features/whatsapp/services/turnosService.ts` — `getHorarios` exportada.

## 9. Verificación

- `npm run typecheck` limpio; **550 tests en verde** (23 nuevos: días, horarios, lugares, mensaje
  presencial, system prompt).
- `npm run lint` está roto en el repo desde antes (Next 16 quitó `next lint` y el `.eslintrc` no
  lo lee ESLint 9). No lo arregla esta tanda.
- E2E manual pendiente: ver checklist del plan (config de lugares como médico y como secretaria,
  mensaje del bot con/sin horarios y lugares, liberación con ventana abierta y cerrada,
  regresión de la vía MercadoPago y de `cobrar_turno_hoy`).

## 10. Efecto colateral a comunicar

Desaparecen las alarmas rojas `necesita_humano` con motivo "orden de consulta OSEP": la bandeja
ya no se enciende por esta vía (decidido, sin reemplazo). El takeover general —pausar el
asistente, responder como humano, resolver alarma— sigue igual para el resto de los casos.

## 11. No incluido

- Franjas horarias por lugar (V2 si aparece el caso de dos lugares el mismo día).
- Lugar en turnos/agenda (`wa_turnos` sigue sin sede).
- Fase B del spec viejo: crear/facturar la orden de consulta dentro de MediCuenta.
- Plantillas HSM de Meta para reabrir la ventana de 24 h.
