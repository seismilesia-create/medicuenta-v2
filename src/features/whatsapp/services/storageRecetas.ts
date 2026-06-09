import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'recetas'

/** Sube el PDF al bucket privado. Path: <medico_id>/<uuid>.pdf (mismo patrón que 'comprobantes'). */
export async function subirPdfReceta(
  db: SupabaseClient,
  medicoId: string,
  buffer: Buffer,
): Promise<string | null> {
  const path = `${medicoId}/${randomUUID()}.pdf`
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: 'application/pdf' })
  if (error) {
    console.error('[recetas] storage upload error:', error.message)
    return null
  }
  return path
}

export async function descargarPdfReceta(db: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from(BUCKET).download(path)
  if (error || !data) {
    console.error('[recetas] storage download error:', error?.message)
    return null
  }
  return Buffer.from(await data.arrayBuffer())
}
