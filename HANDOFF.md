# HANDOFF — MediCuenta V2 (agente WhatsApp) — 2026-06-11 ~08:00 ART

## Estado actual
- **Tarea**: **Fase 2 (turnos por WhatsApp) COMPLETA y probada en vivo por el dueño** — reserva conversacional en dos pasos con identidad completa del paciente, cancelación, candados anti-acaparamiento y agenda del médico por comando. Cerrada con ~12 commits de iteración en vivo sobre feedback del dueño en el mismo día.
- **Estado**: working (sin pendientes de código de Fase 2)
- **Branch**: `feat/whatsapp-recetas-turnos` (sincronizada con origin)
- **Último commit ANTES de este handoff**: `20a3595` fix(agente): nunca asumir que quien escribe es el paciente ni tomar el nombre del perfil de WhatsApp (caso nieto-abuela)

## Qué se construyó esta sesión (2026-06-10 tarde → 2026-06-11)
- **Plan de Fase 2** (`docs/superpowers/plans/2026-06-10-whatsapp-fase2-turnos.md`) ejecutado completo con subagentes + doble review por task (los reviews cazaron bugs reales ANTES de correr: TZ de máquina en weekdayOf, rollover de fechas de V8, ambigüedad de servicios, reservas mudas por presupuesto de steps, barrera que pisaba el texto del turno).
- **Motor**: `src/lib/turnos/` (slots port 1:1 + formato + resolverServicio + validarIdentidad, todos TDD) · `turnosService.ts` (service-role, filtra medico_id a mano) · `toolsTurnos.ts` (consultar_disponibilidad en 2 modos / reservar_turno / cancelar_turno) · integración en runner + systemPrompt.
- **DB**: 3 migraciones aplicadas hoy por el dueño en SQL Editor: `20260611_whatsapp_fase2_turnos.sql` (4 tablas + EXCLUDE gist anti-overbooking, probado en vivo con 23P01), `20260611_config_agente_identidad.sql` (nombre_medico + especialidad), `20260611_turnos_identidad_paciente.sql` (paciente_dni + paciente_obra_social + paciente_apellido, consolidada e idempotente).
- **Iteración en vivo con el dueño** (probó TODO el flujo por WhatsApp): flujo 2 pasos (días → horarios del día), identidad del asistente por médico, motivo de consulta visible en la agenda, nombre y APELLIDO separados, DNI + obra social, candado 1 turno/día por DNI, alarma de tipeo con confirmación, identidad honesta ("asistente virtual", admite ser IA), no asumir que quien escribe es el paciente.
- **Tests**: 109 verdes · typecheck y build limpios. (`npm run lint` sigue roto — deuda conocida.)

## Decisiones tomadas (con el "por qué")
- **Recordatorios HSM + cron: DIFERIDOS a producción** (decisión del dueño) — el bot-escribe-primero necesita plantilla aprobada + cron productivo, y toda la infra paga va al final.
- **cancelar_turno agregada** (no estaba en spec §7) — decisión del dueño; candado por teléfono del que reservó.
- **Flujo conversacional en 2 pasos** — el "choclazo" de 5 días × 14 horarios mareaba; estructuralmente la tool ya no puede devolverlo (fecha_preferida: "" → días; fecha → horarios de ese día; sin lugar → alternativas más cercanas).
- **Nombre y apellido SEPARADOS** — regla de modelado del dueño (guardada en memoria global): aplica a todo schema con personas. En `recetas` queda pendiente pre-producción (el PDF junta los campos pero el RCD los carga separados — anotado en spec).
- **Candados anti-acaparamiento**: 3 turnos activos por número + **1 turno por día por DNI** (caso real de un colega: un paciente le llenó la agenda). El EXCLUDE de DB sigue siendo la última línea contra carreras.
- **Identidad honesta del bot** — se presenta "asistente virtual", admite ser IA si le preguntan, calidez sin simular humano. Respaldado con evidencia (Nature 2023, J.MarComm 2025) + AI Act art. 50 (vigente 08/2026). Tono configurable por médico (campo `tono`).
- **El nombre del perfil de WhatsApp jamás es dato del paciente** — quien escribe puede no ser el paciente (nieto→abuela); los datos se piden siempre.
- **systemPrompt incluye fecha/hora actual AR** — sin eso el modelo no puede convertir "mañana"/"el lunes" a fecha.

## Lo que NO funcionó (no repetir en próxima sesión)
- **Mostrar todos los horarios de todos los días** → confunde al paciente. Quedó bloqueado estructuralmente en la tool.
- **Preguntar "¿qué servicio?" con un solo servicio activo** → fricción inútil; la tool resuelve sola.
- **Asumir el nombre del perfil de WhatsApp como nombre del paciente** → perfiles con apodos + el que escribe puede no ser el paciente.
- **pbcopy para pasarle contenido al dueño** → su app de dictado pisa el portapapeles; SIEMPRE pegar el contenido en el chat (memoria global guardada).
- **Túneles trycloudflare tras suspensión de la Mac** → proceso queda zombie con URL muerta; matar y relanzar (URL nueva → webhook de Meta + PUBLIC_BASE_URL + reiniciar dev).
- **El token temporal de Meta vence en horas** — volvió a pasar; renovarlo en el panel y re-correr `seed-wa-canal.mjs` (lo re-cifra en wa_canales).
- **La shell de Claude pierde el cwd entre comandos** → usar siempre `cd /Users/hector/proyectos/Medicuenta-V2.0 &&` o rutas absolutas.

## Próximo paso concreto
El dueño definió el rumbo al cerrar: **dashboard general de agentes / Fase 3** (panel web del consultorio + su dashboard propio con un agente orquestador que observa a los demás y propone mejoras supervisadas). Acción ejecutable: **brainstorm de Fase 3 partiendo de spec §8.1** (visión de interfaces, decisiones abiertas: Google Calendar sí/no, acceso delegado de secretaria) + memoria `vision-medicuenta-empresa.md` (dashboard orquestador, punto 7). La **infra productiva** (Supabase/Vercel/Meta/MP pagos) va AL FINAL de todo, decisión explícita del dueño.

## Comandos para verificar estado al retomar
```bash
cd ~/proyectos/Medicuenta-V2.0
git status        # esperado: limpio
git log -3        # esperado: 20a3595 (+ commit de este checkpoint encima)
npm test          # esperado: 109 tests verdes
npm run typecheck # esperado: sin errores
```

## Archivos clave para releer en la próxima sesión
- `docs/superpowers/specs/2026-06-09-whatsapp-recetas-turnos-design.md` — §8.1 = visión de interfaces del dueño (3 superficies) + ideas anotadas (OS suspendidas, RENAPER, nombre/apellido en recetas).
- `~/.claude/projects/-Users-hector-proyectos/memory/vision-medicuenta-empresa.md` — la visión completa de empresa (multi-profesión, API/MCP a OS, B2B círculos, asistente financiero, agentes automejorantes).
- `src/features/whatsapp/agent/{toolsTurnos.ts,systemPrompt.ts}` — el estado final del agente (2 modos de disponibilidad, validaciones de identidad).
- `src/features/whatsapp/services/turnosService.ts` — camino service-role completo.
- `docs/superpowers/plans/2026-06-10-whatsapp-fase2-turnos.md` — qué quedó fuera de alcance documentado.

## Notas contextuales
- **Infra efímera APAGADA al cierre** (dev server y túnel muertos). El webhook de Meta quedó apuntando a la URL muerta `crest-show-kidney-processor.trycloudflare.com` → al retomar pruebas: levantar dev + túnel nuevo, actualizar webhook en Meta + `PUBLIC_BASE_URL` en `.env.local`, reiniciar dev, y casi seguro renovar el token temporal de Meta (panel → `seed-wa-canal.mjs`).
- **Datos de prueba en la DB**: turnos reales del E2E de hoy (del número 543834222049), horarios lun-vie 9-13/17-20, servicio "Consulta" 30min, identidad "Héctor Martínez / cirujano general" en wa_config_agente.
- **Chip pendiente**: backport del fix `weekdayOf` (getUTCDay) al repo origen `Agente_Whatsapp` (bug de TZ latente allá).
- **Migraciones**: TODAS las wa_* aplicadas en Supabase (`eylcrxhpccwobipcjzal`). Recordar que las tablas base de MediCuenta siguen sin versionar (dump pendiente si se migra de proyecto Supabase).
- **Gaby** sigue en `dev/gaby` (facturación) — nuestra rama es aditiva; rebasar antes de Fase 3 si avanzó. El dueño quiere revisar/editar esa rama a fondo para la parte mobile (lo dijo el 11/6, anotado en spec §8.1).
- La suite quedó en 109 tests; el plan de Fase 2 con sus 9 tasks completas quedó documentado en el repo.
