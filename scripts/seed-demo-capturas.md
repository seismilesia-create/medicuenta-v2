# Seed de demo para capturas (landing + tutoriales)

**Fecha:** 2026-07-23 · **Aplicado en:** producción (Supabase)
**Médico de demo:** Pedro Ariel Medina Vazquez — `1bee7847-e33a-4aca-af5f-1d43383af540` (iaceleratech@gmail.com, Traumatología)
**Secretaria vinculada:** María — `4c663576-c85c-46ea-9a50-29dc73a2484b` (hector.visiondeportes@gmail.com)

Todos los datos son **inventados**. No hay ningún paciente real. Los nombres, DNIs y teléfonos
fueron generados para las capturas.

## Qué se cargó

| Área | Volumen | Para qué captura sirve |
|---|---|---|
| Lugares de atención | 3 (Pasteur lun/mié/vie · San Javier mar · República 764 jue) | Config del consultorio + el bot respondiendo "¿dónde atiende?" |
| Pacientes / contactos | 20 | Base de todo lo demás |
| Turnos | 71 (mar 21 → lun 27) | Agenda día/semana/mes, con atendidos, ausentes, próximos y huecos libres |
| Sobreturnos | 7 | Panel lateral ámbar de la agenda |
| Check-ins | 5 | Sala de espera (solo se ve en el día en curso) |
| Conversaciones WhatsApp | 14 (3 🔴 · 6 🟢 · 8 🔵, 2 con bot pausado) | Bandeja con los tres colores del semáforo |
| Mensajes | 91 | Hilos completos: turno, receta, orden presencial, handoff humano |
| Órdenes nivel 1 | 147 (ago 2025 → jul 2026) | /ordenes, dashboard, reportes, tabla de 12 meses |
| Cirugías nivel 2 | 10 | /cirugias + "2° nivel sin liquidar" (3 con más de 90 días) |
| Liquidaciones | 10 (2 pendientes) | /liquidaciones + alertas del dashboard |
| Débitos | 24 (los 6 motivos, los 5 agentes) | Gráficos de débitos por motivo y descuentos apilados |
| Cobros | 25 (los 4 medios + 2 pendientes MP) | Caja del mes y rendición diaria |
| Cierres de día | 2 (mar 21 secretaria · mié 22 automático) | /cierre y la tarjeta del dashboard |
| Presentaciones | 7 | /ordenes/presentaciones |
| Recetas | 6 (entregadas, pagada, pendientes, 1 por orden de consulta) | Flujo de recetas del bot |

## Criterios que hay que respetar si se regenera

- **Teléfonos**: `wa_contactos.telefono` va en crudo `549…` (13 dígitos); el resto de las tablas
  usa el canónico `54…` (12, sin el 9). Mezclarlos rompe los vínculos en silencio.
- **Semáforo de la bandeja**: rojo = `necesita_humano`; verde = `last_paciente_at` dentro de 24 h;
  azul = fuera de 24 h. `bot_pausado` es un chip aparte que se combina con cualquiera.
  Las azules **solo se ven en la pestaña "Todas"**.
- **Colores de la agenda**: un turno `reservado` cuya hora ya pasó se pinta verde (atendido).
  Para que se vean turnos azules (próximos) tiene que haber turnos en horas futuras.
- **Cierre del día**: agrupa órdenes por `created_at` (no por `fecha_atencion`) y cobros por
  `cobrado_at`, siempre en día calendario argentino.
- **Reportes**: `facturado = honorario_calculado + monto_particular` (el plus va aparte) y
  `cobrado` solo cuenta las órdenes en estado `aprobada`.
- **Obras sociales**: usar el nombre exacto del catálogo (`O.S.E.P.`, `PAMI`, …) en órdenes y
  cirugías, o el gráfico de facturación por OS abre dos barras para la misma obra social.

## Cómo borrar todo el seed

Borra los datos de demo del médico y deja la cuenta como estaba. **Revisar antes de correr:**
también elimina lo que se haya generado en las pruebas manuales de ese consultorio.

```sql
begin;
delete from cierres_dia    where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from cobros         where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from debitos        where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from liquidaciones  where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from ordenes        where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from presentaciones where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from cirugias       where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from recetas        where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from wa_sobreturnos where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from wa_turnos      where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from wa_mensajes    where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from wa_conversaciones where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from wa_contactos   where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from wa_pacientes   where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
delete from wa_lugares_atencion where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
commit;
```

Para borrar **solo** lo inventado y conservar lo que existía antes de este seed, filtrar por
`created_at >= '2026-07-23'` en cada tabla (salvo `wa_turnos`/`ordenes`, que llevan fechas
retroactivas a propósito).
