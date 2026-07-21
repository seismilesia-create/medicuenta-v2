// Actualiza el nodo del bot (wa_nodos) tras migrar el número a otro WABA:
// nuevo phone_number_id + nuevo access token (cifrado). El número NO cambia.
// Uso: node --env-file=.env.local scripts/update-wa-nodo.mjs <phone_number_id_nuevo> <numero_whatsapp>
//   ej: node --env-file=.env.local scripts/update-wa-nodo.mjs 1216878824841256 543834884384
// Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   ENCRYPTION_KEY, WA_TOKEN_TMP (el token NUEVO del system user, se lee de env para no pasarlo por argv).
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

const [, , phoneNumberIdNuevo, numeroWhatsapp] = process.argv
if (!phoneNumberIdNuevo || !numeroWhatsapp) {
  console.error('Uso: node --env-file=.env.local scripts/update-wa-nodo.mjs <phone_number_id_nuevo> <numero_whatsapp>')
  process.exit(1)
}
const token = process.env.WA_TOKEN_TMP
if (!token) {
  console.error('Falta WA_TOKEN_TMP en el entorno (el token nuevo del system user).')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await db
  .from('wa_nodos')
  .update({ phone_number_id: phoneNumberIdNuevo, access_token_cifrado: cifrar(token) })
  .eq('numero_whatsapp', numeroWhatsapp)
  .select('id, phone_number_id, numero_whatsapp, estado')

if (error) {
  console.error('Error al actualizar wa_nodos:', error)
  process.exit(1)
}
if (!data || data.length === 0) {
  console.error('⚠️ Ninguna fila matcheó numero_whatsapp =', numeroWhatsapp, '— no se actualizó nada.')
  process.exit(1)
}
for (const n of data) {
  console.log('✓ wa_nodos actualizado:', { id: n.id, phone_number_id: n.phone_number_id, numero: n.numero_whatsapp, estado: n.estado })
}
