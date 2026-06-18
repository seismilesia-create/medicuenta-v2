import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ImprimirBoton } from '@/features/ordenes/components/ImprimirBoton'

function fmtMes(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
function fmtFecha(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR')
}
function fmtMonto(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function PlanillaImprimible({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: pres } = await supabase
    .from('presentaciones').select('*').eq('id', id).eq('medico_id', user.id).single()
  if (!pres) notFound()

  const { data: perfil } = await supabase
    .from('perfiles').select('nombre, apellido, matricula').eq('id', user.id).single()
  const { data: ordenes } = await supabase
    .from('ordenes')
    .select('nombre_paciente, fecha_atencion, codigo_practica, nombre_practica, honorario_calculado')
    .eq('presentacion_id', id)
    .order('fecha_atencion', { ascending: true })

  const filas = ordenes ?? []
  const medico = perfil ? `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() : ''

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, color: '#111', background: '#fff' }}>
      <style>{`@media print { [data-no-print] { display: none !important; } }`}</style>

      <div data-no-print style={{ marginBottom: 16 }}>
        <ImprimirBoton />
      </div>

      <header style={{ borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Planilla de presentación</h1>
        <p style={{ margin: '4px 0' }}><strong>{medico}</strong>{perfil?.matricula ? ` — Mat. ${perfil.matricula}` : ''}</p>
        <p style={{ margin: '4px 0' }}>
          Obra social: <strong>{pres.obra_social}</strong> · Período: <strong style={{ textTransform: 'capitalize' }}>{fmtMes(pres.periodo_mes)}</strong>
        </p>
      </header>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #111', textAlign: 'left' }}>
            <th style={{ padding: '6px 4px' }}>Fecha</th>
            <th style={{ padding: '6px 4px' }}>Paciente</th>
            <th style={{ padding: '6px 4px' }}>Código</th>
            <th style={{ padding: '6px 4px' }}>Práctica</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Honorario</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((o, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '6px 4px' }}>{fmtFecha(o.fecha_atencion)}</td>
              <td style={{ padding: '6px 4px' }}>{o.nombre_paciente}</td>
              <td style={{ padding: '6px 4px' }}>{o.codigo_practica ?? '-'}</td>
              <td style={{ padding: '6px 4px' }}>{o.nombre_practica ?? '-'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{fmtMonto(Number(o.honorario_calculado))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #111', fontWeight: 700 }}>
            <td style={{ padding: '6px 4px' }} colSpan={4}>Total ({pres.cantidad_ordenes} órdenes)</td>
            <td style={{ padding: '6px 4px', textAlign: 'right' }}>{fmtMonto(Number(pres.monto_total))}</td>
          </tr>
        </tfoot>
      </table>

      <p style={{ marginTop: 32, fontSize: 12 }}>Firma y sello del profesional: __________________________</p>
    </div>
  )
}
