// Siembra/actualiza la fila wa_canales del médico de prueba.
// Uso: node scripts/seed-wa-canal.mjs <medico_uuid> <numero_personal>
// Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   ENCRYPTION_KEY, WHATSAPP_TEST_PHONE_NUMBER_ID, WHATSAPP_TEST_ACCESS_TOKEN.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, createCipheriv } from 'node:crypto'

// Mismo formato que src/lib/crypto/encryption.ts: base64(iv).base64(tag).base64(ct)
function cifrar(plaintext) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY debe ser 32 bytes en base64')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

const [, , medicoId, numeroPersonal] = process.argv
if (!medicoId || !numeroPersonal) {
  console.error('Uso: node scripts/seed-wa-canal.mjs <medico_uuid> <numero_personal>')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const row = {
  medico_id: medicoId,
  phone_number_id: process.env.WHATSAPP_TEST_PHONE_NUMBER_ID,
  access_token_cifrado: cifrar(process.env.WHATSAPP_TEST_ACCESS_TOKEN),
  numero_personal: numeroPersonal,
  estado: 'conectado',
}

const { error } = await db.from('wa_canales').upsert(row, { onConflict: 'phone_number_id' })
if (error) {
  console.error('Error al sembrar wa_canales:', error)
  process.exit(1)
}
console.log('✓ wa_canales sembrado para médico', medicoId, '| numero_personal', numeroPersonal)
