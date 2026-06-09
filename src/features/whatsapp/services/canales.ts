import type { SupabaseClient } from '@supabase/supabase-js'
import { descifrar } from '@/lib/crypto/encryption'

export interface CanalResuelto {
  medicoId: string
  phoneNumberId: string
  accessToken: string // ya descifrado
  numeroPersonal: string
}

/** Resuelve el canal (médico + token) a partir del phone_number_id que recibió el webhook. */
export async function getCanalByPhoneNumberId(
  db: SupabaseClient,
  phoneNumberId: string,
): Promise<CanalResuelto | null> {
  const { data } = await db
    .from('wa_canales')
    .select('medico_id, phone_number_id, access_token_cifrado, numero_personal, estado')
    .eq('phone_number_id', phoneNumberId)
    .eq('estado', 'conectado')
    .maybeSingle()
  if (!data) return null
  const row = data as {
    medico_id: string
    phone_number_id: string
    access_token_cifrado: string
    numero_personal: string
  }
  return {
    medicoId: row.medico_id,
    phoneNumberId: row.phone_number_id,
    accessToken: descifrar(row.access_token_cifrado),
    numeroPersonal: row.numero_personal,
  }
}
