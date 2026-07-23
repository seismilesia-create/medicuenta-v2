'use client'

import { useEffect, useRef, useState } from 'react'
import { createOrden } from '@/actions/ordenes'
import { buscarSugerenciasTurno, getHorariosDelDia } from '@/actions/consultorio-correlacion'
import { controlQuinceMinutos, type SugerenciaTurno, type ConflictoQuinceMin } from '@/lib/consultorio/correlacion'
import { createClient } from '@/lib/supabase/client'
import { hoyArgentina } from '@/shared/lib/fechas'
import {
  AGENTES_FACTURADORES,
  AGENTE_LABELS,
  type TipoAtencion,
  type Prestacion,
  type OrdenFormData,
  type AgenteFacturador,
} from '../types/ordenes'
import { PracticaAutocomplete } from './PracticaAutocomplete'
import { OsAutocomplete } from '@/features/catalogo/components/OsAutocomplete'
import { getCatalogoOs, getMisOsSuspendidas, getArancelVigente, getMiCategoriaArancel } from '@/actions/catalogo'
import { calcularHonorarioConsulta, type MiCategoriaArancel } from '@/lib/catalogo/honorario'
import { estaSuspendida, type OsCatalogoItem } from '@/lib/catalogo/obras-sociales'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import { EscanearOrdenButton, type OrdenEscaneada } from './EscanearOrdenButton'
import { SugerenciaTurnoCard } from './SugerenciaTurnoCard'
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
import { OCR_ORDEN_PROMPT_VERSION, NUCLEO_LABELS, type CampoNucleo } from '@/lib/ai/ocr-orden'
import { estadoCampoOcr } from '@/lib/ordenes/estado-campo-ocr'
import { PlusCard } from '@/features/cobros/components/PlusCard'
import type { MedioCobro } from '@/features/cobros/types/cobros'

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
  estado,
  colSpan,
  step,
  min,
  onBlur,
}: {
  name: string
  label: string
  type?: string
  defaultValue?: string | number
  placeholder?: string
  mono?: boolean
  dudoso?: boolean
  estado?: 'ok' | 'dudoso' | 'no_encontrado'
  colSpan?: boolean
  step?: string
  min?: string
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
}) {
  const outline =
    estado === 'no_encontrado'
      ? { outline: '2px solid var(--color-error)' }
      : (estado === 'dudoso' || dudoso)
        ? { outline: '2px solid var(--color-warning)' }
        : {}
  return (
    <div className={colSpan ? 'md:col-span-2' : undefined}>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
        {label}
        {estado === 'no_encontrado' && (
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-error)' }}>
            · cargar a mano
          </span>
        )}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        min={min}
        onBlur={onBlur}
        className={`${inputBase}${mono ? ' font-mono' : ''}`}
        style={{ ...inputStyle, ...outline }}
      />
    </div>
  )
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
  const [codigoOs, setCodigoOs] = useState<number | null>(null)
  const [catalogo, setCatalogo] = useState<OsCatalogoItem[]>([])
  const [suspendidasMedico, setSuspendidasMedico] = useState<string[]>([])
  const [agenteFacturador, setAgenteFacturador] = useState<AgenteFacturador>('circulo_medico')
  const [prestacionSeleccionada, setPrestacionSeleccionada] = useState<Prestacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ocr, setOcr] = useState<OrdenEscaneada | null>(null)
  const [imagenComprobante, setImagenComprobante] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  const [firmaPaciente, setFirmaPaciente] = useState(false)
  const [firmaSelloMedico, setFirmaSelloMedico] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')

  const [miCategoria, setMiCategoria] = useState<MiCategoriaArancel | null>(null)
  const [honorario, setHonorario] = useState('')
  const [honorarioMotivo, setHonorarioMotivo] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    getCatalogoOs().then(setCatalogo)
    getMisOsSuspendidas().then(setSuspendidasMedico)
    getMiCategoriaArancel().then(setMiCategoria)
  }, [])

  // Prellenar honorario desde el arancel vigente (consulta nivel 1, sin práctica del nomenclador).
  useEffect(() => {
    if (tipo !== 'obra_social' || prestacionSeleccionada || codigoOs == null || !miCategoria?.categoria_arancel) {
      setHonorarioMotivo(null)
      return
    }
    let cancelado = false
    // Arancel vigente a la fecha de atención cargada en el form (no el último cargado).
    const fechaInput = formRef.current?.elements.namedItem('fecha_atencion') as HTMLInputElement | null
    const fecha = fechaInput?.value || hoyArgentina()
    getArancelVigente(codigoOs, fecha).then((arancel) => {
      if (cancelado) return
      const r = calcularHonorarioConsulta({
        arancel,
        categoria: miCategoria.categoria_arancel,
        atiendeInterior: miCategoria.atiende_interior,
      })
      if (r) { setHonorario(String(r.honorario)); setHonorarioMotivo(r.motivo) }
      else setHonorarioMotivo(null)
    })
    return () => { cancelado = true }
  }, [codigoOs, miCategoria, tipo, prestacionSeleccionada])

  // Correlación turno→orden (3C)
  const [sugerencias, setSugerencias] = useState<SugerenciaTurno[]>([])
  const [turnoAplicado, setTurnoAplicado] = useState<SugerenciaTurno | null>(null)
  const [aviso15, setAviso15] = useState<ConflictoQuinceMin[] | null>(null)

  /** Busca turnos atendidos de un DNI para proponer fecha/horario reales. */
  async function fetchSugerencias(dniRaw: string | undefined | null) {
    const dni = (dniRaw ?? '').replace(/\D/g, '')
    if (dni.length < 7) {
      setSugerencias([])
      return
    }
    const res = await buscarSugerenciasTurno(dni)
    if ('sugerencias' in res) setSugerencias(res.sugerencias)
  }

  /** Un click: completa fecha (y hora, si el turno la tiene) en el formulario. */
  function aplicarSugerencia(s: SugerenciaTurno) {
    const form = formRef.current
    if (form) {
      const fechaInput = form.elements.namedItem('fecha_atencion') as HTMLInputElement | null
      if (fechaInput) fechaInput.value = s.fecha
      if (s.hora) {
        const horaInput = form.elements.namedItem('horario_realizacion') as HTMLInputElement | null
        if (horaInput) horaInput.value = s.hora
      }
    }
    setTurnoAplicado(s)
    setAviso15(null) // cambió la hora: el control de 15 min se recalcula al guardar
  }

  function quitarSugerencia() {
    setTurnoAplicado(null)
  }

  async function handleOcrExtracted(data: OrdenEscaneada) {
    setOcr(data)
    setTipo('obra_social')
    setTurnoAplicado(null)
    setAviso15(null)
    setFirmaPaciente(!!data.firma_paciente)
    setFirmaSelloMedico(!!data.firma_sello_medico)
    setDiagnostico(data.diagnostico ?? '')
    const scan = normalizarOs(data.obra_social ?? '')
    const m = scan ? catalogo.find((c) => normalizarOs(c.nombre_os).includes(scan) || scan.includes(normalizarOs(c.nombre_os))) : undefined
    if (m) { setObraSocial(m.nombre_os); setCodigoOs(m.codigo_os) }
    else if (data.obra_social) { setObraSocial(data.obra_social); setCodigoOs(null) }
    if (data.agente_facturador) setAgenteFacturador(data.agente_facturador)

    // Escanear el código → traer descripción + honorarios desde el nomenclador.
    // El nomenclador (prestaciones) usa la clave 'OSEP'. OSEP (cód 327) → 'OSEP'; el resto no matchea (igual que hoy).
    const osNom = m?.codigo_os === 327 ? 'OSEP' : (m?.nombre_os ?? data.obra_social ?? 'OSEP')
    let prestacion: Prestacion | null = null
    if (data.codigo_practica) {
      prestacion = await buscarPrestacionPorCodigo(osNom, data.codigo_practica)
    }
    setPrestacionSeleccionada(prestacion)
    // Un solo re-render con OCR + prestación ya resuelta.
    setFormKey((k) => k + 1)
    // Con el DNI del OCR, buscamos turnos atendidos para proponer fecha/hora reales.
    fetchSugerencias(data.nro_documento)
  }

  function isDudoso(campo: string): boolean {
    return !!ocr?.campos_dudosos?.includes(campo)
  }

  function estadoCampo(campo: string) {
    return estadoCampoOcr(campo, ocr?.no_encontrados ?? [], ocr?.campos_dudosos ?? [])
  }
  /** Estilo de outline según el estado OCR del campo del núcleo. */
  function outlineOcr(campo: string): React.CSSProperties {
    const e = estadoCampo(campo)
    if (e === 'no_encontrado') return { outline: '2px solid var(--color-error)' }
    if (e === 'dudoso') return { outline: '2px solid var(--color-warning)' }
    return {}
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

    // Control de los 15 minutos (OSEP): si la hora queda muy pegada a otra
    // orden del mismo día, avisamos (no bloqueamos). Solo en el primer intento;
    // un segundo "Guardar" confirma y procede.
    const horaReal = str('horario_realizacion')
    const fechaReal = str('fecha_atencion')
    if (horaReal && fechaReal && aviso15 === null) {
      const res = await getHorariosDelDia(fechaReal)
      if ('ordenes' in res) {
        const conflictos = controlQuinceMinutos(horaReal, res.ordenes)
        if (conflictos.length > 0) {
          setAviso15(conflictos)
          setLoading(false)
          return
        }
      }
    }

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
      datos_ocr: ocr ? { version: OCR_ORDEN_PROMPT_VERSION, datos: ocr } : undefined,
      // Correlación 3C: solo los turnos (no sobreturnos) tienen FK a la agenda.
      turno_id: turnoAplicado?.tipo === 'turno' ? turnoAplicado.id : undefined,
      // Ledger de cobros: medio elegido y cobro MP generado en la tarjeta de plus.
      cobro_medio: str('cobro_medio') as MedioCobro | undefined,
      cobro_id: str('cobro_id'),
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
          codigo_os: codigoOs ?? undefined,
          nro_afiliado: form.get('nro_afiliado') as string,
          token_osep: str('token_osep'),
          firma_paciente: firmaPaciente,
          firma_sello_medico: firmaSelloMedico,
          codigo_practica: prestacionSeleccionada?.codigo ?? (form.get('codigo_practica') as string),
          nombre_practica: prestacionSeleccionada?.detalle ?? str('nombre_practica'),
          diagnostico_cie10: diagnostico || undefined,
          honorario_calculado: prestacionSeleccionada?.total
            ? Number(prestacionSeleccionada.total)
            : Number(honorario || 0),
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

  const today = hoyArgentina()
  const esOsep = codigoOs === 327

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

      {ocr && ocr.no_encontrados.length > 0 && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-error)' }}
        >
          <p className="font-medium" style={{ color: 'var(--color-error)' }}>
            ⚠ Faltan {ocr.no_encontrados.length} datos importantes — cargalos a mano
          </p>
          <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
            {ocr.no_encontrados
              .map((c) => NUCLEO_LABELS[c as CampoNucleo] ?? c)
              .join(', ')}
          </p>
        </div>
      )}

      {ocr && (
      <form key={formKey} ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" style={{ border: '1px solid var(--color-error)' }}>
            {error}
          </div>
        )}

        {/* Plus (privado) — PRIMERO: el OCR nunca lo trae (no figura en el papel)
            y al fondo del form se olvidaba. Solo obra social; en particulares el
            monto de la prestación ES el cobro privado. */}
        {tipo === 'obra_social' && (
          <PlusCard
            key={formKey}
            pacienteNombre={ocr?.paciente || undefined}
            turnoId={turnoAplicado?.tipo === 'turno' ? turnoAplicado.id : undefined}
          />
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
              style={{ ...inputStyle, ...outlineOcr('paciente') }}
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

        {/* Correlación turno→orden (3C): propone fecha/horario reales de la agenda */}
        <SugerenciaTurnoCard
          sugerencias={sugerencias}
          aplicada={turnoAplicado}
          onAplicar={aplicarSugerencia}
          onQuitar={quitarSugerencia}
        />

        {/* ===== Campos Obra Social (en el orden físico de la orden) ===== */}
        {tipo === 'obra_social' && (
          <>
            {/* Cabecera / comprobante (OSEP) */}
            {esOsep && (
              <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Comprobante</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Campo name="delegacion" label="Delegación" defaultValue={ocr?.delegacion ?? ''} />
                  <Campo name="titulo_autorizacion" label="Título de autorización" defaultValue={ocr?.titulo_autorizacion ?? ''} />
                </div>
              </section>
            )}

            {/* Fechas */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Fechas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="nro_comprobante" label="N° Comprobante" mono defaultValue={ocr?.nro_comprobante ?? ''} estado={estadoCampo('nro_comprobante')} />
                <Campo name="fecha_solicitud" label="Fecha de solicitud" type="date" defaultValue={ocr?.fecha_solicitud ?? ''} />
                <Campo name="fecha_vencimiento" label="Fecha de vencimiento" type="date" defaultValue={ocr?.fecha_vencimiento ?? ''} />
                <Campo name="fecha_emision" label="Fecha de emisión" type="date" defaultValue={ocr?.fecha_emision ?? ''} estado={estadoCampo('fecha_emision')} />
                {esOsep && (
                  <>
                    <Campo name="fecha_prescripcion" label="Fecha de prescripción" type="date" defaultValue={ocr?.fecha_prescripcion ?? ''} />
                    <Campo name="hora_emision" label="Hora de emisión" mono placeholder="HH:MM" defaultValue={ocr?.hora_emision ?? ''} />
                  </>
                )}
              </div>
            </section>

            {/* Titular y afiliado */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Titular y afiliado</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Obra Social *</label>
                  <OsAutocomplete
                    catalogo={catalogo}
                    valor={obraSocial}
                    onSelect={({ nombre_os, codigo_os }) => { setObraSocial(nombre_os); setCodigoOs(codigo_os) }}
                    inputClassName={inputBase}
                    inputStyle={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Nro. Afiliado *</label>
                  <input name="nro_afiliado" type="text" required placeholder="000000" defaultValue={ocr?.nro_afiliado ?? ''}
                    className={inputBase} style={{ ...inputStyle, ...outlineOcr('nro_afiliado') }} />
                </div>
                {esOsep && (
                  <>
                    <Campo name="grupo_afiliado" label="Grupo" mono placeholder="01" defaultValue={ocr?.grupo_afiliado ?? ''} dudoso={isDudoso('grupo_afiliado')} />
                    <Campo name="titular_nombre" label="Titular (apellido y nombre)" defaultValue={ocr?.titular_nombre ?? ''} />
                    <Campo name="medico_solicitante" label="Prescriptor / médico solicitante" colSpan defaultValue={ocr?.medico_solicitante ?? ''} />
                  </>
                )}
              </div>

              {/* OSEP: token (cód 327) */}
              {esOsep && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Campo name="token_osep" label="Token OSEP (6 dígitos)" mono placeholder="123456" defaultValue={ocr?.token_osep ?? ''} dudoso={isDudoso('token_osep')} />
                </div>
              )}
            </section>

            {/* Beneficiario / documento */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Beneficiario y documento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="cobertura" label="Cobertura" defaultValue={ocr?.cobertura ?? ''} estado={estadoCampo('cobertura')} />
                <Campo name="tipo_documento" label="Tipo de documento" placeholder="DNI" defaultValue={ocr?.tipo_documento ?? ''} />
                <Campo name="nro_documento" label="N° de documento (DNI)" mono placeholder="00000000" defaultValue={ocr?.nro_documento ?? ''} estado={estadoCampo('nro_documento')} onBlur={(e) => fetchSugerencias(e.target.value)} />
                {esOsep && (
                  <>
                    <Campo name="parentesco" label="Parentesco" defaultValue={ocr?.parentesco ?? ''} />
                    <Campo name="domicilio" label="Domicilio" colSpan defaultValue={ocr?.domicilio ?? ''} />
                  </>
                )}
              </div>
            </section>

            {/* Práctica */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Práctica</h3>
              <PracticaAutocomplete
                obraSocial={codigoOs === 327 ? 'OSEP' : (obraSocial || 'OSEP')}
                onSelect={handlePrestacionSelect}
                value={prestacionSeleccionada ? `${prestacionSeleccionada.codigo} - ${prestacionSeleccionada.detalle}` : ocr?.codigo_practica ?? ''}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="nombre_practica" label="Descripción" colSpan placeholder="Ej: Consulta médica" defaultValue={prestacionSeleccionada?.detalle ?? ocr?.nombre_practica ?? ''} estado={estadoCampo('nombre_practica')} />
                <Campo name="cantidad" label="Cantidad" type="number" min="0" step="1" mono defaultValue={ocr?.cantidad || 1} />
                {esOsep && (
                  <>
                    <Campo name="cara" label="Cara (odontología)" defaultValue={ocr?.cara ?? ''} />
                    <Campo name="pieza" label="Pieza (odontología)" defaultValue={ocr?.pieza ?? ''} />
                  </>
                )}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Diagnóstico CIE-10</label>
                  <input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)}
                    className={inputBase} style={inputStyle} placeholder="Ej: J00 — Rinofaringitis aguda" />
                </div>
              </div>

              {/* Importe manual (fallback): si no se eligió práctica del nomenclador */}
              {!prestacionSeleccionada && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Importe / Honorario</label>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={honorario}
                    onChange={(e) => { setHonorario(e.target.value); setHonorarioMotivo(null) }}
                    placeholder="0.00"
                    className={`${inputBase} font-mono`}
                    style={{ ...inputStyle, ...(isDudoso('importe') ? { outline: '2px solid var(--color-warning)' } : {}) }}
                  />
                  {honorarioMotivo
                    ? <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Auto: {honorarioMotivo} — editable</p>
                    : (codigoOs != null && miCategoria && !miCategoria.categoria_arancel)
                      ? <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Configurá la categoría del médico para auto-calcular.</p>
                      : null}
                </div>
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

            {/* Firmas (checklist anti-débito, toda OS) */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Firmas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={firmaPaciente} onChange={(e) => setFirmaPaciente(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                  <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Firma del afiliado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={firmaSelloMedico} onChange={(e) => setFirmaSelloMedico(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                  <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Firma y sello del médico</span>
                </label>
              </div>
            </section>

            {/* Origen (OSEP) */}
            {esOsep && (
              <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Origen</h3>
                <Campo name="origen" label="Origen" placeholder="Prestador / Web Service" defaultValue={ocr?.origen ?? ''} />
              </section>
            )}

            {/* Arancel / total */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Arancel y total</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {esOsep && (
                  <>
                    <Campo name="arancelista" label="Arancelista" defaultValue={ocr?.arancelista ?? ''} />
                    <Campo name="cajero" label="Cajero" defaultValue={ocr?.cajero ?? ''} />
                  </>
                )}
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

        {/* Observaciones */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Observaciones</label>
          <textarea name="observaciones" rows={3} placeholder="Notas adicionales (opcional)" defaultValue={ocr?.observaciones ?? ''}
            className={`${inputBase} resize-none`} style={inputStyle} />
        </div>

        {/* Control de los 15 minutos (OSEP): aviso, no bloqueo */}
        {aviso15 && aviso15.length > 0 && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}
          >
            <p className="font-medium flex items-center gap-2" style={{ color: 'var(--color-warning)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Atenciones muy seguidas
            </p>
            <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
              Esta atención queda a{' '}
              {aviso15.map((c, i) => (
                <span key={i}>
                  {i > 0 ? ', ' : ''}
                  <strong>{c.brecha} min</strong> de la de {c.paciente} ({c.hora})
                </span>
              ))}
              . OSEP exige mínimo 15 min entre atenciones — revisá la hora o guardá igual si es correcta.
            </p>
          </div>
        )}

        {(() => {
          if (tipo !== 'obra_social') return null
          const { enRiesgo, faltantes } = evaluarRiesgoOrden({
            tipo, obra_social: obraSocial, nivel: 1,
            firma_paciente: firmaPaciente, diagnostico_cie10: diagnostico, firma_sello_medico: firmaSelloMedico,
          })
          if (!enRiesgo) return null
          return (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
              <p className="font-medium" style={{ color: 'var(--color-warning)' }}>⚠️ Riesgo de débito</p>
              <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
                Falta: {faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}. Revisá la orden antes de presentarla (podés guardarla igual).
              </p>
            </div>
          )
        })()}

        {(() => {
          if (tipo !== 'obra_social' || !obraSocial) return null
          if (!estaSuspendida({ codigoOs, obraSocial, catalogo, suspendidasMedico })) return null
          return (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
              <p className="font-medium" style={{ color: 'var(--color-warning)' }}>⚠️ Obra social suspendida</p>
              <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
                Esta obra social está suspendida este mes. Presentarla puede ser debitada — conviene cobrarla como particular.
              </p>
            </div>
          )
        })()}

        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50" style={{ background: aviso15 && aviso15.length > 0 ? 'var(--color-warning)' : 'var(--color-primary)' }}>
            {loading ? 'Guardando...' : aviso15 && aviso15.length > 0 ? 'Guardar igual' : 'Guardar orden'}
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
