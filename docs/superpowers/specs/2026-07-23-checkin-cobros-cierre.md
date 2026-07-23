# Check-in + cobros + cierre del día (tanda 2026-07-23)

Plan aprobado por Héctor (4 fases, commits `e47a44d..822c08f`). Resumen de lo shippeado y decisiones.

## Qué se construyó

- **Ledger `cobros`** (plus / consulta_particular · efectivo / transferencia / débito-QR / mercadopago · pendiente / cobrado / anulado / devuelto; anclas orden/turno/sobreturno; índices únicos parciales anti-doble-cobro). `ordenes.monto_plus` sigue siendo la fuente de Reportes — sync unidireccional en `src/lib/cobros/sync.ts`. Cobros en mano registrados vía orden llevan `cobrado_at` = fecha de atención (mediodía AR).
- **Plus por MercadoPago**: namespace `plus:<cobroId>` + rama `?cobro=` del webhook (la rama `?receta=` quedó intacta). `PlusCard` prominente arriba del form post-OCR con QR en pantalla y poll de acreditación; el aviso al médico va por push.
- **Check-in**: `checkin_at/checkin_por` en turnos y sobreturnos (columna, no estado). Botón "Llegó" (popover + sobreturnos), sala EN SALA en la vista día de hoy, cobro en recepción y **orden mínima tipeada** (OS + N°/token, ~10 seg en desktop) que queda "sin foto"; el lote `OrdenesSinFoto` fotografía la pila después y el OCR **solo completa campos vacíos** (`mergeOcrEnOrden`). La secretaria opera vía actions con `resolverConsultorio()` + service-role (molde liberarReceta); la foto sube a la carpeta del MÉDICO.
- **Bot cobra al llegar**: tool `cobrar_turno_hoy` (candado: turno de HOY del mismo teléfono; plus = `wa_config_agente.monto_plus_default`, particular = precio del servicio; reusa el cobro pendiente del mostrador). El mensaje "llegué" **reabre la ventana de 24h** → `llamarPaciente` manda "pase al consultorio" por texto libre gratis (botón 📣 en la sala, `puedeLlamar`). El prompt ya NO dice "los turnos no se pagan por WhatsApp": pago SOLO al llegar, nunca señas de turnos futuros.
- **Cierre del día** (`/cierre`, médico-only): órdenes cargadas hoy por OS valorizadas, caja por medio, flags "atención de otro día" y "provienen de recetas" (N° ∈ `recetas.nro_orden_consulta`), lista roja "atendidos sin orden ni cobro". "Cerrar día" persiste snapshot en `cierres_dia`; cron `0 2 * * *` UTC (23:00 ART) cierra automático (el manual gana) + push con el resumen. `recetas.pagada_at` nuevo (sin backfill). Menú "Dashboard" → "Inicio" + Caja del mes.

## Fuera de alcance (futuro)

- Regla multi-día de anti-solape de órdenes de una misma OS (hoy solo `controlQuinceMinutos` same-day).
- Plantillas HSM de Meta: no hacen falta — la ventana se abre con la interacción del paciente.

## E2E manual pendiente (contra prod)

1. **A**: orden con plus efectivo → fila en `cobros`; link de plus $100 → pago real → webhook en logs → "Acreditado" → push.
2. **B**: turno por bot → "Llegó" → cobro efectivo → orden tipeada (OS+N°) → sala con badges → borrador "sin foto" con `registrada_por` → foto en lote sin pisar lo tipeado. Negativos: turno ajeno, `/ordenes` como secretaria.
3. **C**: check-in deja cobro pendiente → "llegué" al bot → link → pago → "Pagado ✓" + push → 📣 Llamar → llega el WhatsApp. Negativo: Llamar con ventana cerrada.
4. **D**: `/cierre` cuadra con el día armado → Cerrar día → `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/cierre-dia` → cierre automático + push. Inicio: label + caja del mes.
