// Siembra wa_servicios + wa_horarios del médico de prueba (idempotente:
// upsert del servicio por (medico_id, nombre); los horarios se borran y recrean).
// Uso: node --env-file=.env.local scripts/seed-wa-turnos.mjs <medico_uuid>
// Editá SERVICIOS y HORARIOS acá abajo si querés otros valores.
import { createClient } from '@supabase/supabase-js'

const SERVICIOS = [{ nombre: 'Consulta', duracion_min: 30, precio: null }]

// weekday: 0=domingo … 6=sábado. Lun-Vie, mañana y tarde (siesta en el medio).
const HORARIOS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, open_time: '09:00', close_time: '13:00' },
  { weekday, open_time: '17:00', close_time: '20:00' },
])

const [, , medicoId] = process.argv
if (!medicoId) {
  console.error('Uso: node --env-file=.env.local scripts/seed-wa-turnos.mjs <medico_uuid>')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

for (const s of SERVICIOS) {
  const { error } = await db
    .from('wa_servicios')
    .upsert({ medico_id: medicoId, ...s, activo: true }, { onConflict: 'medico_id,nombre' })
  if (error) {
    console.error('Error al sembrar wa_servicios:', error)
    process.exit(1)
  }
}

const { error: delError } = await db.from('wa_horarios').delete().eq('medico_id', medicoId)
if (delError) {
  console.error('Error al limpiar wa_horarios:', delError)
  process.exit(1)
}
const { error: insError } = await db
  .from('wa_horarios')
  .insert(HORARIOS.map((h) => ({ medico_id: medicoId, ...h })))
if (insError) {
  console.error('Error al sembrar wa_horarios:', insError)
  process.exit(1)
}

console.log(
  `✓ Sembrado para médico ${medicoId}: ${SERVICIOS.length} servicio(s), ${HORARIOS.length} bloques de horario`,
)
