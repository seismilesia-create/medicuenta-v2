'use client'

interface Props {
  toolName: string
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
  input?: unknown
  output?: unknown
  errorText?: string
  recordDeleted?: boolean
  recordHref?: string
}

const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  registrar_orden: { icon: '📋', label: 'Registrar orden' },
  registrar_cirugia: { icon: '🩺', label: 'Registrar cirugía' },
  registrar_debito: { icon: '💸', label: 'Registrar débito' },
  consultar_nomenclador: { icon: '📖', label: 'Consultar nomenclador' },
  analizar_imagen_orden: { icon: '📷', label: 'Analizar imagen' },
  ayuda_plataforma: { icon: '💡', label: 'Ayuda' },
}

export function ToolCallCard({ toolName, state, output, errorText, recordDeleted, recordHref }: Props) {
  const meta = TOOL_LABELS[toolName] ?? { icon: '🔧', label: toolName }

  const isLoading = state === 'input-streaming' || state === 'input-available'
  const isError = state === 'output-error'
  const outputObj = output && typeof output === 'object' ? (output as Record<string, unknown>) : null
  const success = outputObj?.success === true
  const errorInOutput = !success && outputObj?.error ? String(outputObj.error) : null

  let borderColor = 'var(--color-border)'
  let bgColor = 'var(--color-background)'
  if (state === 'output-available' && success) {
    borderColor = 'var(--color-success)'
    bgColor = 'var(--color-success-light)'
  } else if (isError || errorInOutput) {
    borderColor = 'var(--color-error)'
    bgColor = 'var(--color-error-light)'
  }

  return (
    <div
      className="max-w-[85%] rounded-xl px-3 py-2.5 text-xs"
      style={{ border: `1px solid ${borderColor}`, backgroundColor: bgColor }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{meta.icon}</span>
        <span className="font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {meta.label}
        </span>
        {isLoading && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted-foreground)', animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted-foreground)', animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted-foreground)', animationDelay: '300ms' }} />
          </span>
        )}
        {state === 'output-available' && success && (
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-success)' }}>✓ listo</span>
        )}
        {(isError || errorInOutput) && (
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-error)' }}>✗ error</span>
        )}
        {recordDeleted && (
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
            style={{ color: 'var(--color-muted)', backgroundColor: 'var(--color-border)' }}
          >
            registro eliminado
          </span>
        )}
      </div>

      <ToolCardBody toolName={toolName} state={state} output={outputObj} errorText={errorText ?? errorInOutput ?? undefined} />

      {recordHref && !recordDeleted && state === 'output-available' && success && (
        <a
          href={recordHref}
          className="inline-block mt-2 text-[11px] font-medium underline"
          style={{ color: 'var(--color-primary)' }}
        >
          Ver registro →
        </a>
      )}
    </div>
  )
}

function ToolCardBody({
  toolName,
  state,
  output,
  errorText,
}: {
  toolName: string
  state: string
  output: Record<string, unknown> | null
  errorText?: string
}) {
  if (state === 'input-streaming' || state === 'input-available') {
    return <p style={{ color: 'var(--color-muted-foreground)' }}>Procesando...</p>
  }

  if (errorText) {
    return <p style={{ color: 'var(--color-error)' }}>{errorText}</p>
  }

  if (!output) return null

  if (toolName === 'consultar_nomenclador') {
    const resultados = Array.isArray(output.resultados) ? output.resultados : []
    if (resultados.length === 0) {
      return <p style={{ color: 'var(--color-muted-foreground)' }}>Sin resultados para &quot;{String(output.busqueda ?? '')}&quot;</p>
    }
    return (
      <div className="space-y-1">
        {resultados.slice(0, 5).map((r: Record<string, unknown>, i: number) => (
          <div key={i} className="flex justify-between gap-2 py-1" style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : undefined }}>
            <div className="min-w-0 flex-1">
              <span className="font-mono font-semibold">{String(r.codigo ?? '')}</span>
              <span className="ml-2" style={{ color: 'var(--color-muted-foreground)' }}>{String(r.detalle ?? '')}</span>
            </div>
            <span className="font-mono" style={{ color: 'var(--color-success)' }}>
              ${Number(r.total ?? 0).toLocaleString('es-AR')}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (toolName === 'registrar_orden' || toolName === 'registrar_cirugia') {
    return (
      <div className="space-y-0.5" style={{ color: 'var(--color-foreground)' }}>
        <p>Paciente: <span className="font-medium">{String(output.paciente ?? '')}</span></p>
        {output.obra_social !== undefined && <p>OS: <span className="font-medium">{String(output.obra_social)}</span></p>}
        {!!output.institucion && <p>Institución: <span className="font-medium">{String(output.institucion)}</span></p>}
        {!!output.nivel && <p>Nivel: <span className="font-medium">{String(output.nivel)}</span></p>}
        <p>
          Total: <span className="font-mono font-medium" style={{ color: 'var(--color-success)' }}>
            ${Number(output.monto_total ?? output.total ?? 0).toLocaleString('es-AR')}
          </span>
        </p>
        <p style={{ color: 'var(--color-muted-foreground)' }}>Estado: borrador</p>
      </div>
    )
  }

  if (toolName === 'registrar_debito') {
    return (
      <div className="space-y-0.5">
        <p>Motivo: <span className="font-medium">{String(output.motivo ?? '')}</span></p>
        <p>Monto: <span className="font-mono font-medium" style={{ color: 'var(--color-error)' }}>${Number(output.monto ?? 0).toLocaleString('es-AR')}</span></p>
        {output.refacturable === true && <p className="text-[11px]" style={{ color: 'var(--color-warning)' }}>Marcado como refacturable</p>}
      </div>
    )
  }

  if (toolName === 'analizar_imagen_orden') {
    const confianza = String(output.confianza ?? 'media')
    return (
      <div className="space-y-0.5">
        <p style={{ color: 'var(--color-muted-foreground)' }}>Confianza: <span style={{ color: 'var(--color-foreground)' }}>{confianza}</span></p>
        {output.paciente != null && <p>Paciente: {String(output.paciente)}</p>}
        {output.obra_social != null && <p>OS: {String(output.obra_social)}</p>}
        {output.codigo_practica != null && <p>Código: {String(output.codigo_practica)}</p>}
        {Array.isArray(output.campos_dudosos) && output.campos_dudosos.length > 0 && (
          <p className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
            Verificar: {(output.campos_dudosos as string[]).join(', ')}
          </p>
        )}
      </div>
    )
  }

  return null
}
