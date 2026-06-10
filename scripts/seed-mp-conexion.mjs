// Siembra/actualiza mp_conexiones con un Access Token de MercadoPago (modo prueba o real).
// Uso: node scripts/seed-mp-conexion.mjs <medico_uuid> <ACCESS_TOKEN>
// Requiere: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, createCipheriv } from 'node:crypto'

function cifrar(plaintext) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY debe ser 32 bytes en base64')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

const [, , medicoId, accessToken] = process.argv
if (!medicoId || !accessToken) {
  console.error('Uso: node scripts/seed-mp-conexion.mjs <medico_uuid> <ACCESS_TOKEN>')
  process.exit(1)
}

// Validar el token y obtener el mp_user_id (collector) — clave para la validación cross-tenant.
const me = await fetch('https://api.mercadopago.com/users/me', {
  headers: { Authorization: `Bearer ${accessToken}` },
}).then((r) => r.json())
if (!me?.id) {
  console.error('El Access Token no es válido para MercadoPago:', me)
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error } = await db.from('mp_conexiones').upsert(
  {
    medico_id: medicoId,
    mp_user_id: String(me.id),
    access_token_cifrado: cifrar(accessToken),
    refresh_token_cifrado: null,
    expires_at: null, // los tokens de prueba no expiran; OAuth real setea esto
    estado: 'conectado',
  },
  { onConflict: 'medico_id' },
)
if (error) {
  console.error('Error al sembrar mp_conexiones:', error)
  process.exit(1)
}
console.log('✓ mp_conexiones sembrada para médico', medicoId, '| mp_user_id', me.id, '| nickname', me.nickname ?? '')
