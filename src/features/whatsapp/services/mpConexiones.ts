import type { SupabaseClient } from '@supabase/supabase-js'
import { cifrar, descifrar } from '@/lib/crypto/encryption'

export interface ConexionMP {
  mpUserId: string
  accessToken: string // ya descifrado
}

interface ConexionRow {
  mp_user_id: string
  access_token_cifrado: string
  refresh_token_cifrado: string | null
  expires_at: string | null
  estado: string
}

/**
 * Devuelve la conexión MP utilizable del médico (token descifrado), refrescándola
 * si está por expirar. Si no se puede usar/refrescar → marca 'reconectar' y null.
 */
export async function getConexionActiva(db: SupabaseClient, medicoId: string): Promise<ConexionMP | null> {
  const { data } = await db
    .from('mp_conexiones')
    .select('mp_user_id, access_token_cifrado, refresh_token_cifrado, expires_at, estado')
    .eq('medico_id', medicoId)
    .maybeSingle()
  let row = data as ConexionRow | null
  if (!row || row.estado !== 'conectado') return null

  const expiraPronto = row.expires_at && new Date(row.expires_at).getTime() - Date.now() < 24 * 60 * 60 * 1000
  if (expiraPronto) {
    const ok = await refrescarToken(db, medicoId, row)
    if (!ok) return null
    const { data: data2 } = await db
      .from('mp_conexiones')
      .select('mp_user_id, access_token_cifrado, refresh_token_cifrado, expires_at, estado')
      .eq('medico_id', medicoId)
      .maybeSingle()
    row = data2 as ConexionRow | null
    if (!row) return null
  }
  return { mpUserId: row.mp_user_id, accessToken: descifrar(row.access_token_cifrado) }
}

/** Refresca el token OAuth. Si falla (o no hay refresh_token/credenciales) → estado 'reconectar'. */
async function refrescarToken(db: SupabaseClient, medicoId: string, row: ConexionRow): Promise<boolean> {
  const clientId = process.env.MP_CLIENT_ID
  const clientSecret = process.env.MP_CLIENT_SECRET
  if (!row.refresh_token_cifrado || !clientId || !clientSecret) {
    await marcarReconectar(db, medicoId)
    return false
  }
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: descifrar(row.refresh_token_cifrado),
      }),
    })
    if (!res.ok) throw new Error(`oauth/token ${res.status}`)
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!json.access_token) throw new Error('sin access_token')
    await db
      .from('mp_conexiones')
      .update({
        access_token_cifrado: cifrar(json.access_token),
        refresh_token_cifrado: json.refresh_token ? cifrar(json.refresh_token) : row.refresh_token_cifrado,
        expires_at: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('medico_id', medicoId)
    return true
  } catch (e) {
    console.error('[mp] refresh token falló:', e)
    await marcarReconectar(db, medicoId)
    return false
  }
}

/** El cobro de este médico queda pausado hasta que reconecte — nunca falla en silencio. */
export async function marcarReconectar(db: SupabaseClient, medicoId: string): Promise<void> {
  await db
    .from('mp_conexiones')
    .update({ estado: 'reconectar', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
}
