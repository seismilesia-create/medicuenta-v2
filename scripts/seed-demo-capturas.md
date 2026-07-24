# Seed de demo para capturas (landing + tutoriales)

**Fecha:** 2026-07-23 · **Aplicado en:** producción (Supabase)
**Médico de demo:** Dr. Juan Pérez — `1bee7847-e33a-4aca-af5f-1d43383af540` (Traumatología).
Nombre de fantasía elegido a propósito para las capturas. La cuenta sigue siendo
iaceleratech@gmail.com: **el email no se cambió** porque es la credencial de acceso — si sacás
capturas de la pantalla de perfil, ese dato se ve.
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

## ⚠️ Refrescar antes de sacar capturas (importante)

Dos cosas dependen del reloj y se "vencen" con el paso de los días:

1. **Los colores de la bandeja**: una conversación es verde solo si el paciente escribió hace
   menos de 24 h. Pasado ese plazo se vuelve azul y la captura pierde el verde.
2. **La sala de espera**: solo se muestra en el día en curso.

Correr esto **el mismo día** en que se sacan las capturas deja todo fresco:

```sql
-- 1) Rejuvenece la bandeja: rojas, verdes y azules quedan bien respecto de "ahora"
update wa_conversaciones c
set last_paciente_at = now() - (v.hace_min || ' minutes')::interval,
    last_message_at  = now() - (greatest(v.hace_min - 2, 0) || ' minutes')::interval
from (values
  ('3834501122',65),('3834506677',180),('3834517788',35),      -- 🔴 alerta
  ('3834503344',12),('3834504455',95),('3834505566',240),
  ('3834507788',420),('3834510011',610),('3834515566',150),    -- 🟢 vivas
  ('3834508899',4320),('3834509900',2880),('3834511122',5760),
  ('3834512233',1800),('3834513344',7200)                      -- 🔵 terminadas
) as v(nac, hace_min)
join wa_contactos ct on ct.medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540'
                    and ct.telefono = '549' || v.nac
where c.contacto_id = ct.id and c.medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';

-- 2) Los mensajes acompañan el nuevo horario de su conversación
update wa_mensajes m
set created_at = c.last_message_at - (x.desde_el_final * interval '3 minutes')
from wa_conversaciones c,
     lateral (select row_number() over (partition by m2.conversacion_id order by m2.created_at desc) - 1 as desde_el_final
              from wa_mensajes m2 where m2.id = m.id) x
where m.conversacion_id = c.id and c.medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';

-- 3) Sala de espera del día: marca 3 pacientes como "en sala" hace un rato
update wa_turnos set checkin_at = now() - interval '12 minutes'
where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540'
  and id in (select id from wa_turnos
             where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540'
               and (starts_at at time zone 'America/Argentina/Catamarca')::date = current_date
               and estado in ('reservado','confirmado','completado')
             order by starts_at limit 3);
```

**Para mover la semana de turnos a otra fecha** (si las capturas se hacen más adelante):

```sql
-- Corre TODA la agenda N días hacia adelante (cambiar el 7)
update wa_turnos set starts_at = starts_at + interval '7 days', ends_at = ends_at + interval '7 days',
                     checkin_at = checkin_at + interval '7 days'
where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
update wa_sobreturnos set fecha = fecha + 7, checkin_at = checkin_at + interval '7 days'
where medico_id = '1bee7847-e33a-4aca-af5f-1d43383af540';
```

Ojo: mover los turnos **no** mueve las órdenes ni los cierres, así que la rendición diaria
quedaría desalineada de la agenda. Si se necesita todo corrido, avisar y se rehace el seed.

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
