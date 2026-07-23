'use client'

import { useState, useEffect, useRef } from 'react'
import { updateOrden } from '@/actions/ordenes'
import {
  AGENTES_FACTURADORES,
  AGENTE_LABELS,
  type TipoAtencion,
  type Prestacion,
  type OrdenFormData,
  type Orden,
  type AgenteFacturador,
} from '../types/ordenes'
import { PracticaAutocomplete } from './PracticaAutocomplete'
import { OsAutocomplete } from '@/features/catalogo/components/OsAutocomplete'
import { getCatalogoOs, getMisOsSuspendidas, getArancelVigente, getMiCategoriaArancel } from '@/actions/catalogo'
import { estaSuspendida, type OsCatalogoItem } from '@/lib/catalogo/obras-sociales'
import { calcularHonorarioConsulta, type MiCategoriaArancel } from '@/lib/catalogo/honorario'
import { PlusCard, type CobroVinculado } from '@/features/cobros/components/PlusCard'
import type { MedioCobro } from '@/features/cobros/types/cobros'

const inputBase = 'w-full px-4 py-3 rounded-lg text-sm'
const inputStyle = {
  background: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-foreground)',
} as const
const sectionStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' } as const

function Campo({
  name,
  label,
  type = 'text',
  defaultValue,
  placeholder,
  mono,
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
        style={inputStyle}
      />
    </div>
  )
}

interface Props {
  orden: Orden
  /** Cobro vivo anclado a la orden (lo trae la page con el client del médico). */
  cobroVinculado?: CobroVinculado | null
}

export function EditarOrdenForm({ orden, cobroVinculado }: Props) {
  const [tipo, setTipo] = useState<TipoAtencion>(orden.tipo)
  const [obraSocial, setObraSocial] = useState(orden.obra_social ?? '')
  const [agenteFacturador, setAgenteFacturador] = useState<AgenteFacturador>(orden.agente_facturador ?? 'circulo_medico')
  const [prestacionSeleccionada, setPrestacionSeleccionada] = useState<Prestacion | null>(
    orden.codigo_practica
      ? {
          id: 0,
          codigo: orden.codigo_practica,
          detalle: orden.nombre_practica ?? '',
          honorarios: null,
          gastos: null,
          total: orden.honorario_calculado,
          seccion: '',
          categoria: null,
          obra_social: orden.obra_social ?? '',
        }
      : null
  )
  const [codigoOs, setCodigoOs] = useState<number | null>(orden.codigo_os ?? null)
  const [catalogo, setCatalogo] = useState<OsCatalogoItem[]>([])
  const [suspendidasMedico, setSuspendidasMedico] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [miCategoria, setMiCategoria] = useState<MiCategoriaArancel | null>(null)
  const [honorario, setHonorario] = useState(orden.honorario_calculado ? String(orden.honorario_calculado) : '')
  const [honorarioMotivo, setHonorarioMotivo] = useState<string | null>(null)
  const osCambiada = useRef(false)

  useEffect(() => {
    getCatalogoOs().then(setCatalogo)
    getMisOsSuspendidas().then(setSuspendidasMedico)
    getMiCategoriaArancel().then(setMiCategoria)
  }, [])

  useEffect(() => {
    if (!osCambiada.current || tipo !== 'obra_social' || prestacionSeleccionada || codigoOs == null || !miCategoria?.categoria_arancel) {
      return
    }
    let cancelado = false
    // Arancel vigente a la fecha de atención de la orden (no el último cargado).
    getArancelVigente(codigoOs, orden.fecha_atencion).then((arancel) => {
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

  function handlePrestacionSelect(prestacion: Prestacion) {
    setPrestacionSeleccionada(prestacion)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const str = (k: string) => (form.get(k) as string) || undefined

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
          firma_paciente: form.get('firma_paciente') === 'on',
          firma_sello_medico: form.get('firma_sello_medico') === 'on',
          // No hay input `codigo_practica` (la práctica se elige por el autocomplete);
          // sin selección, form.get da null → Zod lo rechaza. El campo es opcional, así
          // que undefined. La práctica ya vive en `prestacionSeleccionada` si la había.
          codigo_practica: prestacionSeleccionada?.codigo ?? undefined,
          nombre_practica: prestacionSeleccionada?.detalle ?? str('nombre_practica'),
          diagnostico_cie10: str('diagnostico_cie10'),
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

    const result = await updateOrden(orden.id, formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // If success, updateOrden redirects to /ordenes/:id
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" style={{ border: '1px solid var(--color-error)' }}>
          {error}
        </div>
      )}

      {/* Tipo de atencion */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>Tipo de atención</label>
        <div className="flex gap-3">
          <button type="button" onClick={() => setTipo('obra_social')} className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
            style={tipo === 'obra_social'
              ? { background: 'var(--color-primary)', color: 'white', boxShadow: '0 0 0 2px var(--color-primary)' }
              : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }}>
            Obra Social
          </button>
          <button type="button" onClick={() => setTipo('particular')} className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
            style={tipo === 'particular'
              ? { background: 'var(--color-secondary)', color: 'white', boxShadow: '0 0 0 2px var(--color-secondary)' }
              : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }}>
            Particular
          </button>
        </div>
      </div>

      {/* Agente facturador */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>Agente facturador *</label>
        <select value={agenteFacturador} onChange={(e) => setAgenteFacturador(e.target.value as AgenteFacturador)} required className={inputBase} style={inputStyle}>
          {AGENTES_FACTURADORES.map((a) => (<option key={a} value={a}>{AGENTE_LABELS[a]}</option>))}
        </select>
      </div>

      {/* Paciente + fecha */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo name="nombre_paciente" label="Nombre del paciente *" defaultValue={orden.nombre_paciente} placeholder="Juan Perez" />
        <Campo name="fecha_atencion" label="Fecha de atención (realización) *" type="date" defaultValue={orden.fecha_atencion} />
      </div>

      {tipo === 'obra_social' && (
        <>
          {/* Cabecera */}
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Comprobante</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Campo name="delegacion" label="Delegación" defaultValue={orden.delegacion ?? ''} />
              <Campo name="nro_comprobante" label="N° Comprobante" mono defaultValue={orden.nro_comprobante ?? ''} />
              <Campo name="titulo_autorizacion" label="Título de autorización" defaultValue={orden.titulo_autorizacion ?? ''} />
            </div>
          </section>

          {/* Fechas */}
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Fechas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Campo name="fecha_solicitud" label="Fecha de solicitud" type="date" defaultValue={orden.fecha_solicitud ?? ''} />
              <Campo name="fecha_vencimiento" label="Fecha de vencimiento" type="date" defaultValue={orden.fecha_vencimiento ?? ''} />
              <Campo name="fecha_prescripcion" label="Fecha de prescripción" type="date" defaultValue={orden.fecha_prescripcion ?? ''} />
              <Campo name="fecha_emision" label="Fecha de emisión" type="date" defaultValue={orden.fecha_emision ?? ''} />
              <Campo name="hora_emision" label="Hora de emisión" mono placeholder="HH:MM" defaultValue={orden.hora_emision ?? ''} />
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
                  onSelect={({ nombre_os, codigo_os }) => { setObraSocial(nombre_os); setCodigoOs(codigo_os); osCambiada.current = true }}
                  inputClassName={inputBase}
                  inputStyle={inputStyle}
                />
              </div>
              <Campo name="nro_afiliado" label="Nro. Afiliado *" defaultValue={orden.nro_afiliado ?? ''} placeholder="000000" />
              <Campo name="grupo_afiliado" label="Grupo" mono placeholder="01" defaultValue={orden.grupo_afiliado ?? ''} />
              <Campo name="titular_nombre" label="Titular (apellido y nombre)" defaultValue={orden.titular_nombre ?? ''} />
              <Campo name="medico_solicitante" label="Prescriptor / médico solicitante" colSpan defaultValue={orden.medico_solicitante ?? ''} />
            </div>

            {codigoOs === 327 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo name="token_osep" label="Token OSEP (6 dígitos)" mono placeholder="123456" defaultValue={orden.token_osep ?? ''} />
              </div>
            )}
          </section>

          {/* Beneficiario / documento */}
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Beneficiario y documento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Campo name="cobertura" label="Cobertura" defaultValue={orden.cobertura ?? ''} />
              <Campo name="parentesco" label="Parentesco" defaultValue={orden.parentesco ?? ''} />
              <Campo name="tipo_documento" label="Tipo de documento" placeholder="DNI" defaultValue={orden.tipo_documento ?? ''} />
              <Campo name="nro_documento" label="N° de documento (DNI)" mono placeholder="00000000" defaultValue={orden.nro_documento ?? ''} />
              <Campo name="domicilio" label="Domicilio" colSpan defaultValue={orden.domicilio ?? ''} />
            </div>
          </section>

          {/* Práctica */}
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Práctica</h3>
            <PracticaAutocomplete obraSocial={codigoOs === 327 ? 'OSEP' : (obraSocial || 'OSEP')} onSelect={handlePrestacionSelect} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Campo name="nombre_practica" label="Descripción" colSpan placeholder="Ej: Consulta médica" defaultValue={orden.nombre_practica ?? ''} />
              <Campo name="cantidad" label="Cantidad" type="number" min="0" step="1" mono defaultValue={orden.cantidad ?? 1} />
              <Campo name="cara" label="Cara (odontología)" defaultValue={orden.cara ?? ''} />
              <Campo name="pieza" label="Pieza (odontología)" defaultValue={orden.pieza ?? ''} />
              <Campo name="diagnostico_cie10" label="Diagnóstico CIE-10" colSpan defaultValue={orden.diagnostico_cie10 ?? ''} />
            </div>

            {!prestacionSeleccionada && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Importe / Honorario</label>
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={honorario}
                  onChange={(e) => { setHonorario(e.target.value); setHonorarioMotivo(null) }}
                  placeholder="0.00"
                  className={`${inputBase} font-mono`}
                  style={inputStyle}
                />
                {honorarioMotivo && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Auto: {honorarioMotivo} — editable</p>
                )}
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


          {/* Firmas */}
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Firmas</h3>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input name="firma_paciente" type="checkbox" defaultChecked={orden.firma_paciente} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Firma del afiliado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input name="firma_sello_medico" type="checkbox" defaultChecked={orden.firma_sello_medico} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Firma y sello del médico</span>
              </label>
            </div>
          </section>

          {/* Origen */}
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Origen</h3>
            <Campo name="origen" label="Origen" placeholder="Prestador / Web Service" defaultValue={orden.origen ?? ''} />
          </section>

          {/* Arancel / total */}
          <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Arancel y total</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Campo name="arancelista" label="Arancelista" defaultValue={orden.arancelista ?? ''} />
              <Campo name="cajero" label="Cajero" defaultValue={orden.cajero ?? ''} />
              <Campo name="total_cargo_afiliado" label="Total a cargo afiliado" type="number" min="0" step="0.01" mono placeholder="0.00" defaultValue={orden.total_cargo_afiliado || ''} />
              <Campo name="horario_realizacion" label="Hora de realización" mono placeholder="HH:MM" defaultValue={orden.horario_realizacion ?? ''} />
            </div>
          </section>

        </>
      )}

      {tipo === 'particular' && (
        <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-secondary)' }}>Prestación Particular</h3>
          <Campo name="nombre_practica" label="Descripción de la prestación *" defaultValue={orden.nombre_practica ?? ''} placeholder="Consulta, cirugía menor, etc." />
          <Campo name="monto_particular" label="Monto cobrado *" type="number" min="0" step="0.01" mono placeholder="0.00" defaultValue={orden.monto_particular} />
        </section>
      )}

      {/* Plus (solo Obra Social) */}
      {tipo === 'obra_social' && (
        <PlusCard
          cobroExistente={cobroVinculado}
          montoInicial={Number(orden.monto_plus) || 0}
          pacienteNombre={orden.nombre_paciente}
          turnoId={orden.turno_id ?? undefined}
        />
      )}

      {/* Observaciones */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Observaciones</label>
        <textarea name="observaciones" rows={3} placeholder="Notas adicionales (opcional)" defaultValue={orden.observaciones ?? ''} className={`${inputBase} resize-none`} style={inputStyle} />
      </div>

      {/* Suspendida warning */}
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
        <button type="submit" disabled={loading} className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <a href={`/ordenes/${orden.id}`} className="px-4 py-3.5 rounded-lg text-sm font-medium transition-colors text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
