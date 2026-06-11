// Carga inicial de wa_pacientes desde wa_turnos existentes (spec Fase 3 §7).
// Idempotente: corre las veces que haga falta. El turno MÁS NUEVO de cada DNI
// aporta la obra social; nombre/apellido existentes en wa_pacientes no se pisan.
// Uso: node --env-file=.env.local scripts/backfill-wa-pacientes.mjs
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: turnos, error } = await db
  .from('wa_turnos')
  .select('medico_id, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, paciente_telefono, created_at')
  .not('paciente_dni', 'is', null)
  .order('created_at', { ascending: true })
if (error) {
  console.error('Error leyendo wa_turnos:', error)
  process.exit(1)
}

// Agrupar por (medico, dni): el más nuevo pisa OS; los teléfonos se acumulan.
const porClave = new Map()
for (const t of turnos ?? []) {
  const dni = (t.paciente_dni ?? '').trim()
  if (!dni) continue
  const clave = `${t.medico_id}|${dni}`
  const prev = porClave.get(clave)
  const telefonos = new Set(prev?.telefonos ?? [])
  if (t.paciente_telefono) telefonos.add(t.paciente_telefono)
  porClave.set(clave, {
    medico_id: t.medico_id,
    dni,
    nombre: prev?.nombre || t.paciente_nombre || null,
    apellido: prev?.apellido || t.paciente_apellido || null,
    obra_social: t.paciente_obra_social || prev?.obra_social || null,
    telefonos,
  })
}

let creados = 0
let actualizados = 0
for (const p of porClave.values()) {
  const { data: existente } = await db
    .from('wa_pacientes')
    .select('id, nombre, apellido, obra_social, telefonos')
    .eq('medico_id', p.medico_id)
    .eq('dni', p.dni)
    .maybeSingle()

  if (!existente) {
    const { error: insError } = await db.from('wa_pacientes').insert({
      medico_id: p.medico_id,
      dni: p.dni,
      nombre: p.nombre,
      apellido: p.apellido,
      obra_social: p.obra_social,
      telefonos: [...p.telefonos],
    })
    if (insError) {
      console.error(`Error insertando DNI ${p.dni}:`, insError)
      process.exit(1)
    }
    creados++
    continue
  }

  const telefonos = new Set([
    ...(Array.isArray(existente.telefonos) ? existente.telefonos : []),
    ...p.telefonos,
  ])
  const { error: updError } = await db
    .from('wa_pacientes')
    .update({
      nombre: existente.nombre || p.nombre,
      apellido: existente.apellido || p.apellido,
      obra_social: p.obra_social || existente.obra_social,
      telefonos: [...telefonos],
      updated_at: new Date().toISOString(),
    })
    .eq('id', existente.id)
  if (updError) {
    console.error(`Error actualizando DNI ${p.dni}:`, updError)
    process.exit(1)
  }
  actualizados++
}

console.log(`✓ Backfill wa_pacientes: ${creados} creados, ${actualizados} actualizados (${porClave.size} pacientes únicos)`)
