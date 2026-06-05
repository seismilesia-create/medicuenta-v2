'use client'

import { useState } from 'react'
import { createOrden } from '@/actions/ordenes'
import { createClient } from '@/lib/supabase/client'
import {
  OBRAS_SOCIALES,
  AGENTES_FACTURADORES,
  AGENTE_LABELS,
  type TipoAtencion,
  type Prestacion,
  type OrdenFormData,
  type AgenteFacturador,
} from '../types/ordenes'
import { PracticaAutocomplete } from './PracticaAutocomplete'
import { EscanearOrdenButton, type OrdenEscaneada } from './EscanearOrdenButton'

const inputBase = 'w-full px-4 py-3 rounded-lg text-sm'
const inputStyle = {
  background: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-foreground)',
} as const
const sectionStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' } as const

/** Campo de texto/fecha/número simple, etiquetado. */
function Campo({
  name,
  label,
  type = 'text',
  defaultValue,
  placeholder,
  mono,
  dudoso,
  colSpan,
  step,
  min,
}: {
  name: string
  label: string
  type?: string
  defaultValue?: string | number
  placeholder?: string
  mono?: boolean
  dudoso?: boolean
  colSpan?: boolean
  step?: string
  min?: string
}) {
  return (
    <div className={colSpan ? 'md:col-span-2' : undefined}>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
        {label}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        min={min}
        className={`${inputBase}${mono ? ' font-mono' : ''}`}
        style={{ ...inputStyle, ...(dudoso ? { outline: '2px solid var(--color-warning)' } : {}) }}
      />
    </div>
  )
}

function matchesOsFromScan(scanned: string | null): string {
  if (!scanned) return ''
  const low = scanned.toLowerCase()
  for (const os of OBRAS_SOCIALES) {
    if (os.toLowerCase() === low) return os
  }
  for (const os of OBRAS_SOCIALES) {
    if (low.includes(os.toLowerCase()) || os.toLowerCase().includes(low)) return os
  }
  return ''
}

// El código en la orden viene envuelto (ej: "01-420101-01"); el núcleo es el
// segmento de dígitos más largo (ej: "420101"), que es lo que guarda el nomenclador.
function nucleoCodigo(raw: string): string {
  const segs = raw.split(/[^0-9]+/).filter(Boolean)
  if (segs.length === 0) return raw.trim()
  return segs.reduce((a, b) => (b.length >= a.length ? b : a))
}

const PRESTACION_SELECT = 'id, codigo, detalle, honorarios, gastos, total, seccion, categoria, obra_social'

/** Convierte un data URL (base64) a Blob para subir a Storage. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** Busca una prestación del nomenclador a partir del código escaneado, tolerante al formato. */
async function buscarPrestacionPorCodigo(obraSocial: string, rawCodigo: string): Promise<Prestacion | null> {
  const supabase = createClient()
  const nucleo = nucleoCodigo(rawCodigo)
  const candidatos = Array.from(new Set([nucleo, rawCodigo.trim()].filter(Boolean)))

  // 1) Match exacto por núcleo o por el código completo.
  for (const cand of candidatos) {
    const { data } = await supabase
      .from('prestaciones')
      .select(PRESTACION_SELECT)
      .eq('obra_social', obraSocial)
      .eq('codigo', cand)
      .limit(1)
    if (data && data.length) return data[0] as Prestacion
  }

  // 2) Match por substring del núcleo (cubre códigos guardados envueltos).
  if (nucleo.length >= 3) {
    const { data } = await supabase
      .from('prestaciones')
      .select(PRESTACION_SELECT)
      .eq('obra_social', obraSocial)
      .ilike('codigo', `%${nucleo}%`)
      .limit(1)
    if (data && data.length) return data[0] as Prestacion
  }

  return null
}

export function NuevaOrdenForm() {
  const [tipo, setTipo] = useState<TipoAtencion>('obra_social')
  const [obraSocial, setObraSocial] = useState('')
  const [agenteFacturador, setAgenteFacturador] = useState<AgenteFacturador>('circulo_medico')
  const [prestacionSeleccionada, setPrestacionSeleccionada] = useState<Prestacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ocr, setOcr] = useState<OrdenEscaneada | null>(null)
  const [imagenComprobante, setImagenComprobante] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  async function handleOcrExtracted(data: OrdenEscaneada) {
    setOcr(data)
    setTipo('obra_social')
    const matched = matchesOsFromScan(data.obra_social)
    if (matched) setObraSocial(matched)
    if (data.agente_facturador) setAgenteFacturador(data.agente_facturador)

    // Escanear el código → traer descripción + honorarios desde el nomenclador.
    let prestacion: Prestacion | null = null
    if (data.codigo_practica) {
      prestacion = await buscarPrestacionPorCodigo(matched || 'OSEP', data.codigo_practica)
    }
    setPrestacionSeleccionada(prestacion)
    // Un solo re-render con OCR + prestación ya resuelta.
    setFormKey((k) => k + 1)
  }

  function isDudoso(campo: string): boolean {
    return !!ocr?.campos_dudosos?.includes(campo)
  }

  function handlePrestacionSelect(prestacion: Prestacion) {
    setPrestacionSeleccionada(prestacion)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const str = (k: string) => (form.get(k) as string) || undefined

    // Subir la foto escaneada como comprobante (bucket privado). No bloquea el guardado si falla.
    let imagenPath: string | undefined
    if (imagenComprobante) {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const path = `${user.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from('comprobantes')
            .upload(path, dataUrlToBlob(imagenComprobante), { contentType: 'image/jpeg', upsert: false })
          if (!upErr) imagenPath = path
          else console.error('[comprobante] upload error:', upErr.message)
        }
      } catch (err) {
        console.error('[comprobante] upload failed:', err)
      }
    }

    // Campos adicionales comunes (OCR / orden completa)
    const comunes = {
      nro_documento: str('nro_documento'),
      nro_comprobante: str('nro_comprobante'),
      grupo_afiliado: str('grupo_afiliado'),
      fecha_vencimiento: str('fecha_vencimiento'),
      cantidad: form.get('cantidad') ? Number(form.get('cantidad')) : undefined,
      medico_solicitante: str('medico_solicitante'),
      horario_realizacion: str('horario_realizacion'),
      delegacion: str('delegacion'),
      titulo_autorizacion: str('titulo_autorizacion'),
      nro_internacion: str('nro_internacion'),
      fecha_solicitud: str('fecha_solicitud'),
      fecha_prescripcion: str('fecha_prescripcion'),
      fecha_emision: str('fecha_emision'),
      hora_emision: str('hora_emision'),
      titular_nombre: str('titular_nombre'),
      cobertura: str('cobertura'),
      parentesco: str('parentesco'),
      domicilio: str('domicilio'),
      tipo_documento: str('tipo_documento'),
      alias: str('alias'),
      cara: str('cara'),
      pieza: str('pieza'),
      forma_pago: str('forma_pago'),
      cod_pago: str('cod_pago'),
      origen: str('origen'),
      arancelista: str('arancelista'),
      cajero: str('cajero'),
      total_cargo_afiliado: form.get('total_cargo_afiliado') ? Number(form.get('total_cargo_afiliado')) : undefined,
      matricula_profesional: str('matricula_profesional'),
      profesional: str('profesional'),
      entidad: str('entidad'),
      responsable: str('responsable'),
      imagen_comprobante: imagenPath,
    }

    const formData: OrdenFormData = tipo === 'obra_social'
      ? {
          tipo: 'obra_social',
          nombre_paciente: form.get('nombre_paciente') as string,
          fecha_atencion: form.get('fecha_atencion') as string,
          observaciones: str('observaciones'),
          monto_plus: Number(form.get('monto_plus') || 0),
          agente_facturador: agenteFacturador,
          obra_social: obraSocial,
          nro_afiliado: form.get('nro_afiliado') as string,
          token_osep: str('token_osep'),
          firma_paciente: form.get('firma_paciente') === 'on',
          codigo_practica: prestacionSeleccionada?.codigo ?? (form.get('codigo_practica') as string),
          nombre_practica: prestacionSeleccionada?.detalle ?? str('nombre_practica'),
          diagnostico_cie10: str('diagnostico_cie10'),
          honorario_calculado: prestacionSeleccionada?.total
            ? Number(prestacionSeleccionada.total)
            : Number(form.get('honorario_calculado') || 0),
          ...comunes,
        }
      : {
          tipo: 'particular',
          nombre_paciente: form.get('nombre_paciente') as string,
          fecha_atencion: form.get('fecha_atencion') as string,
          observaciones: str('observaciones'),
          monto_plus: Number(form.get('monto_plus') || 0),
          agente_facturador: agenteFacturador,
          nombre_practica: form.get('nombre_practica') as string,
          monto_particular: Number(form.get('monto_particular') || 0),
          ...comunes,
        }

    const result = await createOrden(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // If success, createOrden redirects to /ordenes
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-2xl">
      <EscanearOrdenButton
        onExtracted={handleOcrExtracted}
        onImage={setImagenComprobante}
        variant={ocr ? 'compact' : 'hero'}
      />

      {ocr && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: 'var(--color-success-light, rgba(34,197,94,0.1))', border: '1px solid var(--color-success)' }}
        >
          <p style={{ color: 'var(--color-success)' }}>
            ✓ Datos extraídos (confianza: {ocr.confianza})
            {ocr.campos_dudosos.length > 0 && (
              <span className="block text-xs mt-1" style={{ color: 'var(--color-warning)' }}>
                Verificá: {ocr.campos_dudosos.join(', ')}
              </span>
            )}
          </p>
        </div>
      )}

      {ocr && (
      <form key={formKey} onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" style={{ border: '1px solid var(--color-error)' }}>
            {error}
          </div>
        )}

        {/* Tipo de atencion */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>
            Tipo de atencion
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTipo('obra_social')}
              className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
              style={tipo === 'obra_social'
                ? { background: 'var(--color-primary)', color: 'white', boxShadow: '0 0 0 2px var(--color-primary)' }
                : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }}
            >
              Obra Social
            </button>
            <button
              type="button"
              onClick={() => setTipo('particular')}
              className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
              style={tipo === 'particular'
                ? { background: 'var(--color-secondary)', color: 'white', boxShadow: '0 0 0 2px var(--color-secondary)' }
                : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }}
            >
              Particular
            </button>
          </div>
        </div>

        {/* Agente facturador */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>
            Agente facturador *
          </label>
          <select
            value={agenteFacturador}
            onChange={(e) => setAgenteFacturador(e.target.value as AgenteFacturador)}
            required
            className={inputBase}
            style={inputStyle}
          >
            {AGENTES_FACTURADORES.map((a) => (
              <option key={a} value={a}>{AGENTE_LABELS[a]}</option>
            ))}
          </select>
        </div>

        {/* Paciente + fecha de atención (requeridos para ambos tipos) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Nombre del paciente *
            </label>
            <input
              name="nombre_paciente"
              type="text"
              required
              placeholder="Juan Perez"
              defaultValue={ocr?.paciente ?? ''}
              className={inputBase}
              style={{ ...inputStyle, ...(isDudoso('paciente') ? { outline: '2px solid var(--color-warning)' } : {}) }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Fecha de atencion (realización) *
            </label>
            <input
              name="fecha_atencion"
              type="date"
              required
              defaultValue={ocr?.fecha_realizacion ?? today}
              max={today}
              className={inputBase}
              style={inputStyle}
            />
          </div>
        </div>

        {/* ===== Campos Obra Social (en el orden físico de la orden) ===== */}
        {tipo === 'obra_social' && (
          <>
            {/* Cabecera / comprobante */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Comprobante</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="delegacion" label="Delegación" defaultValue={ocr?.delegacion ?? ''} />
                <Campo name="nro_comprobante" label="N° Comprobante" mono defaultValue={ocr?.nro_comprobante ?? ''} dudoso={isDudoso('nro_comprobante')} />
                <Campo name="titulo_autorizacion" label="Título de autorización" defaultValue={ocr?.titulo_autorizacion ?? ''} />
              </div>
            </section>

            {/* Fechas */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Fechas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="fecha_solicitud" label="Fecha de solicitud" type="date" defaultValue={ocr?.fecha_solicitud ?? ''} />
                <Campo name="fecha_vencimiento" label="Fecha de vencimiento" type="date" defaultValue={ocr?.fecha_vencimiento ?? ''} />
                <Campo name="fecha_prescripcion" label="Fecha de prescripción" type="date" defaultValue={ocr?.fecha_prescripcion ?? ''} />
                <Campo name="fecha_emision" label="Fecha de emisión" type="date" defaultValue={ocr?.fecha_emision ?? ''} />
                <Campo name="hora_emision" label="Hora de emisión" mono placeholder="HH:MM" defaultValue={ocr?.hora_emision ?? ''} />
              </div>
            </section>

            {/* Titular y afiliado */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Titular y afiliado</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Obra Social *</label>
                  <select value={obraSocial} onChange={(e) => setObraSocial(e.target.value)} required className={inputBase} style={inputStyle}>
                    <option value="">Seleccionar...</option>
                    {OBRAS_SOCIALES.map((os) => (<option key={os} value={os}>{os}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Nro. Afiliado *</label>
                  <input name="nro_afiliado" type="text" required placeholder="000000" defaultValue={ocr?.nro_afiliado ?? ''}
                    className={inputBase} style={{ ...inputStyle, ...(isDudoso('nro_afiliado') ? { outline: '2px solid var(--color-warning)' } : {}) }} />
                </div>
                <Campo name="grupo_afiliado" label="Grupo" mono placeholder="01" defaultValue={ocr?.grupo_afiliado ?? ''} dudoso={isDudoso('grupo_afiliado')} />
                <Campo name="titular_nombre" label="Titular (apellido y nombre)" defaultValue={ocr?.titular_nombre ?? ''} />
                <Campo name="medico_solicitante" label="Prescriptor / médico solicitante" colSpan defaultValue={ocr?.medico_solicitante ?? ''} />
              </div>

              {/* OSEP: token + firma */}
              {obraSocial === 'OSEP' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Campo name="token_osep" label="Token OSEP (6 dígitos)" mono placeholder="123456" defaultValue={ocr?.token_osep ?? ''} dudoso={isDudoso('token_osep')} />
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input name="firma_paciente" type="checkbox" defaultChecked={!!ocr?.firma_paciente} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                      <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Firma del paciente</span>
                    </label>
                  </div>
                </div>
              )}
            </section>

            {/* Beneficiario / documento */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Beneficiario y documento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="cobertura" label="Cobertura" defaultValue={ocr?.cobertura ?? ''} />
                <Campo name="parentesco" label="Parentesco" defaultValue={ocr?.parentesco ?? ''} />
                <Campo name="tipo_documento" label="Tipo de documento" placeholder="DNI" defaultValue={ocr?.tipo_documento ?? ''} />
                <Campo name="nro_documento" label="N° de documento (DNI)" mono placeholder="00000000" defaultValue={ocr?.nro_documento ?? ''} dudoso={isDudoso('nro_documento')} />
                <Campo name="domicilio" label="Domicilio" colSpan defaultValue={ocr?.domicilio ?? ''} />
              </div>
            </section>

            {/* Práctica */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Práctica</h3>
              <PracticaAutocomplete
                obraSocial={obraSocial || 'OSEP'}
                onSelect={handlePrestacionSelect}
                value={prestacionSeleccionada ? `${prestacionSeleccionada.codigo} - ${prestacionSeleccionada.detalle}` : ocr?.codigo_practica ?? ''}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="nombre_practica" label="Descripción" colSpan placeholder="Ej: Consulta médica" defaultValue={prestacionSeleccionada?.detalle ?? ocr?.nombre_practica ?? ''} dudoso={isDudoso('nombre_practica')} />
                <Campo name="cantidad" label="Cantidad" type="number" min="0" step="1" mono defaultValue={ocr?.cantidad || 1} />
                <Campo name="cara" label="Cara (odontología)" defaultValue={ocr?.cara ?? ''} />
                <Campo name="pieza" label="Pieza (odontología)" defaultValue={ocr?.pieza ?? ''} />
                <Campo name="diagnostico_cie10" label="Diagnóstico CIE-10" colSpan defaultValue={ocr?.diagnostico ?? ''} />
              </div>

              {/* Importe manual (fallback): si no se eligió práctica del nomenclador */}
              {!prestacionSeleccionada && (
                <Campo name="honorario_calculado" label="Importe / Honorario" type="number" min="0" step="0.01" mono placeholder="0.00" defaultValue={ocr?.importe || ''} dudoso={isDudoso('importe')} />
              )}

              {prestacionSeleccionada && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--color-background)', border: '1px solid var(--color-success)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Honorario calculado</p>
                      <p className="text-sm font-mono" style={{ color: 'var(--color-foreground)' }}>
                        {prestacionSeleccionada.codigo} - {prestacionSeleccionada.detalle}
                      </p>
                    </div>
                    <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-success)' }}>
                      ${Number(prestacionSeleccionada.total ?? 0).toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              )}
            </section>


            {/* Origen */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Origen</h3>
              <Campo name="origen" label="Origen" placeholder="Prestador / Web Service" defaultValue={ocr?.origen ?? ''} />
            </section>

            {/* Arancel / total */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Arancel y total</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="arancelista" label="Arancelista" defaultValue={ocr?.arancelista ?? ''} />
                <Campo name="cajero" label="Cajero" defaultValue={ocr?.cajero ?? ''} />
                <Campo name="total_cargo_afiliado" label="Total a cargo afiliado" type="number" min="0" step="0.01" mono placeholder="0.00" defaultValue={ocr?.total_cargo_afiliado || ''} />
                <Campo name="horario_realizacion" label="Hora de realización" mono placeholder="HH:MM" defaultValue={ocr?.horario_realizacion ?? ''} />
              </div>
            </section>

          </>
        )}

        {/* ===== Campos Particular ===== */}
        {tipo === 'particular' && (
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-secondary)' }}>Prestacion Particular</h3>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Descripcion de la prestacion *</label>
              <input name="nombre_practica" type="text" required placeholder="Consulta, cirugia menor, etc." className={inputBase} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Monto cobrado *</label>
              <input name="monto_particular" type="number" required min="0" step="0.01" placeholder="0.00" className={`${inputBase} font-mono`} style={inputStyle} />
            </div>
          </section>
        )}

        {/* Plus (solo Obra Social) */}
        {tipo === 'obra_social' && (
          <div className="p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-warning)' }}>
                <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>Plus (privado)</h3>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)' }}>Este dato es estrictamente privado. Solo vos podes verlo.</p>
            <input name="monto_plus" type="number" min="0" step="0.01" defaultValue="0" placeholder="0.00" className={`${inputBase} font-mono`} style={inputStyle} />
          </div>
        )}

        {/* Observaciones */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Observaciones</label>
          <textarea name="observaciones" rows={3} placeholder="Notas adicionales (opcional)" defaultValue={ocr?.observaciones ?? ''}
            className={`${inputBase} resize-none`} style={inputStyle} />
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
            {loading ? 'Guardando...' : 'Guardar orden'}
          </button>
          <a href="/ordenes" className="px-4 py-3.5 rounded-lg text-sm font-medium transition-colors text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}>
            Cancelar
          </a>
        </div>
      </form>
      )}
    </div>
  )
}
