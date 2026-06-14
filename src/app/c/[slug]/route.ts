import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getNodoActivoBySlug } from '@/features/whatsapp/services/nodos'
import { construirWaMeUrl } from '@/lib/whatsapp/linkNodo'

export const runtime = 'nodejs' // createServiceClient (service-role) usa node

// GET /c/[slug] — link público y estable del médico (PRP-006, Fase 2).
// Resuelve el slug → nodo activo y redirige (302) a wa.me con el saludo + [ID:slug].
// Es público (sin auth): no debe quedar detrás del guard de rol/plan del middleware.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createServiceClient()
  const nodo = await getNodoActivoBySlug(db, slug)
  const waUrl = nodo ? construirWaMeUrl(nodo.numeroWhatsapp, slug) : null
  if (!waUrl) return consultorioNoDisponible()
  return NextResponse.redirect(waUrl, 302)
}

/** Página amable para slug inexistente, asignación inactiva o nodo sin número válido aún. */
function consultorioNoDisponible(): Response {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consultorio no disponible · MediCuenta</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:#f6f7f9; color:#1f2937; }
  .card { max-width:420px; text-align:center; background:#fff; border:1px solid #e5e7eb;
    border-radius:16px; padding:32px 28px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .logo { font-weight:700; font-size:18px; color:#0f766e; letter-spacing:-.01em; }
  h1 { font-size:20px; margin:16px 0 8px; }
  p { font-size:15px; line-height:1.5; color:#4b5563; margin:0; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">MediCuenta</div>
    <h1>Consultorio no disponible</h1>
    <p>Este enlace no está activo en este momento. Por favor, contactá directamente a tu profesional para coordinar tu consulta.</p>
  </div>
</body>
</html>`
  return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
