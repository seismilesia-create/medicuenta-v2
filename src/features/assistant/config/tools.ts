import { tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getVisionModel } from '@/lib/ai/openrouter'
import { generateObject } from 'ai'
import { NAVIGATION_DESTINATIONS } from './navigation'
import { ordenExtraidaSchema, OCR_ORDEN_PROMPT } from '@/lib/ai/ocr-orden'

const AGENTE_ENUM = z.enum(['circulo_medico', 'medical_group', 'comunidad'])
const NIVEL_ENUM = z.union([z.literal(1), z.literal(2)])

async function requireMedicoId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return { supabase, medicoId: user.id }
}

// ============================================================================
// Tool 1: registrar_orden
// ============================================================================
export const registrarOrdenTool = tool({
  description: `Registra una nueva orden de consulta o prestación menor (1° Nivel). Se guarda en estado 'borrador'.
REQUISITO OBLIGATORIO: las órdenes SOLO se cargan desde una FOTO. Ejecutá esta tool únicamente DESPUÉS de analizar_imagen_orden, y pasá su 'imagen_comprobante'. Si el médico quiere registrar una orden sin foto (dictando datos), NO uses esta tool: pedile que te mande la foto de la orden.
IMPORTANTE: Siempre confirmá los datos con el médico antes de ejecutar la tool.

Ejemplo OS: { tipo: 'obra_social', nombre_paciente: 'Juan Pérez', fecha_atencion: '2026-04-16', obra_social: 'OSEP', nro_afiliado: '1234', agente_facturador: 'circulo_medico', codigo_practica: '420101', honorario_calculado: 5000, monto_plus: 0 }

Ejemplo particular: { tipo: 'particular', nombre_paciente: 'María Gómez', fecha_atencion: '2026-04-16', nombre_practica: 'Consulta particular', monto_particular: 8000, monto_plus: 0, agente_facturador: 'circulo_medico' }`,
  inputSchema: z.object({
    tipo: z.enum(['obra_social', 'particular']),
    nombre_paciente: z.string().min(2),
    fecha_atencion: z.string().describe('YYYY-MM-DD'),
    agente_facturador: AGENTE_ENUM.default('circulo_medico'),
    monto_plus: z.number().min(0).default(0),
    observaciones: z.string().optional(),

    // Campos adicionales (opcionales) — provienen del OCR o de la orden completa
    nro_documento: z.string().optional().describe('DNI del paciente'),
    nro_comprobante: z.string().optional().describe('N° de comprobante de la orden'),
    fecha_vencimiento: z.string().optional().describe('YYYY-MM-DD'),
    grupo_afiliado: z.string().optional().describe('Grupo del afiliado (ej: "01")'),
    cantidad: z.number().min(0).optional().describe('Cantidad de la práctica (default 1)'),
    medico_solicitante: z.string().optional(),
    horario_realizacion: z.string().optional().describe('HH:MM'),
    // Captura completa de la orden OSEP (todos opcionales)
    delegacion: z.string().optional(),
    titulo_autorizacion: z.string().optional(),
    nro_internacion: z.string().optional(),
    fecha_solicitud: z.string().optional().describe('YYYY-MM-DD'),
    fecha_prescripcion: z.string().optional().describe('YYYY-MM-DD'),
    fecha_emision: z.string().optional().describe('YYYY-MM-DD'),
    hora_emision: z.string().optional().describe('HH:MM'),
    titular_nombre: z.string().optional(),
    cobertura: z.string().optional(),
    parentesco: z.string().optional(),
    domicilio: z.string().optional(),
    tipo_documento: z.string().optional(),
    alias: z.string().optional(),
    cara: z.string().optional(),
    pieza: z.string().optional(),
    forma_pago: z.string().optional(),
    cod_pago: z.string().optional(),
    origen: z.string().optional(),
    arancelista: z.string().optional(),
    cajero: z.string().optional(),
    total_cargo_afiliado: z.number().min(0).optional(),
    matricula_profesional: z.string().optional(),
    profesional: z.string().optional(),
    entidad: z.string().optional(),
    responsable: z.string().optional(),
    imagen_comprobante: z.string().optional().describe('Ruta del comprobante que devolvió analizar_imagen_orden. OBLIGATORIA para Nivel 1: no registres una orden de foto sin esto.'),

    // Nivel 2 (foja quirúrgica) — se carga por VOZ, sin foto
    nivel: z.number().int().optional().describe('1 = consulta/práctica ambulatoria (foto). 2 = foja quirúrgica (voz). Default 1.'),
    cirugia_adicional: z.string().optional().describe('Nivel 2: descripción de la cirugía adicional'),
    cirugia_adicional_codigo: z.string().optional().describe('Nivel 2: código de nomenclador de la cirugía adicional'),
    cirugia_adicional_honorario: z.number().min(0).optional().describe('Nivel 2: honorario de la cirugía adicional'),
    rol_medico: z.enum(['cirujano_principal', 'ayudante']).optional().describe('Nivel 2: rol del médico'),

    // OS specific (required when tipo='obra_social')
    obra_social: z.string().optional(),
    nro_afiliado: z.string().optional(),
    token_osep: z.string().optional(),
    firma_paciente: z.boolean().optional(),
    codigo_practica: z.string().optional(),
    nombre_practica: z.string().optional(),
    diagnostico_cie10: z.string().optional(),
    honorario_calculado: z.number().min(0).optional(),

    // Particular specific (required when tipo='particular')
    monto_particular: z.number().min(0).optional(),
  }),
  execute: async (input) => {
    try {
      const { supabase, medicoId } = await requireMedicoId()

      if (input.tipo === 'obra_social') {
        // Nivel 2 (foja quirúrgica por voz) NO captura nro de afiliado: ese dato
        // solo viene del OCR en Nivel 1 (orden por foto). No lo exijas en Nivel 2.
        const esNivel2 = input.nivel === 2
        if (!input.obra_social || !input.codigo_practica || (!esNivel2 && !input.nro_afiliado)) {
          return {
            success: false,
            error: esNivel2
              ? 'Obra social y código de práctica (cirugía principal) son requeridos'
              : 'Obra social, número de afiliado y código de práctica son requeridos',
          }
        }
      } else {
        if (!input.nombre_practica || !input.monto_particular) {
          return { success: false, error: 'Descripción y monto son requeridos para particular' }
        }
      }

      const insertData = {
        medico_id: medicoId,
        tipo: input.tipo,
        nombre_paciente: input.nombre_paciente,
        fecha_atencion: input.fecha_atencion,
        observaciones: input.observaciones ?? null,
        monto_plus: input.monto_plus ?? 0,
        agente_facturador: input.agente_facturador,
        obra_social: input.tipo === 'obra_social' ? input.obra_social : null,
        nro_afiliado: input.tipo === 'obra_social' ? (input.nro_afiliado ?? null) : null,
        token_osep: input.tipo === 'obra_social' ? (input.token_osep ?? null) : null,
        firma_paciente: input.tipo === 'obra_social' ? !!input.firma_paciente : false,
        codigo_practica: input.tipo === 'obra_social' ? input.codigo_practica : null,
        nombre_practica: input.nombre_practica ?? null,
        diagnostico_cie10: input.tipo === 'obra_social' ? (input.diagnostico_cie10 ?? null) : null,
        honorario_calculado: input.tipo === 'obra_social' ? (input.honorario_calculado ?? 0) : 0,
        monto_particular: input.tipo === 'particular' ? input.monto_particular : 0,
        // Campos adicionales (genéricos, opcionales)
        nro_documento: input.nro_documento ?? null,
        nro_comprobante: input.nro_comprobante ?? null,
        fecha_vencimiento: input.fecha_vencimiento ?? null,
        grupo_afiliado: input.grupo_afiliado ?? null,
        cantidad: input.cantidad ?? 1,
        medico_solicitante: input.medico_solicitante ?? null,
        horario_realizacion: input.horario_realizacion ?? null,
        // Captura completa de la orden OSEP
        delegacion: input.delegacion ?? null,
        titulo_autorizacion: input.titulo_autorizacion ?? null,
        nro_internacion: input.nro_internacion ?? null,
        fecha_solicitud: input.fecha_solicitud || null,
        fecha_prescripcion: input.fecha_prescripcion || null,
        fecha_emision: input.fecha_emision || null,
        hora_emision: input.hora_emision ?? null,
        titular_nombre: input.titular_nombre ?? null,
        cobertura: input.cobertura ?? null,
        parentesco: input.parentesco ?? null,
        domicilio: input.domicilio ?? null,
        tipo_documento: input.tipo_documento ?? null,
        alias: input.alias ?? null,
        cara: input.cara ?? null,
        pieza: input.pieza ?? null,
        forma_pago: input.forma_pago ?? null,
        cod_pago: input.cod_pago ?? null,
        origen: input.origen ?? null,
        arancelista: input.arancelista ?? null,
        cajero: input.cajero ?? null,
        total_cargo_afiliado: input.total_cargo_afiliado ?? null,
        matricula_profesional: input.matricula_profesional ?? null,
        profesional: input.profesional ?? null,
        entidad: input.entidad ?? null,
        responsable: input.responsable ?? null,
        imagen_comprobante: input.imagen_comprobante ?? null,
        // Nivel 2 (foja quirúrgica)
        nivel: input.nivel ?? 1,
        cirugia_adicional: input.cirugia_adicional ?? null,
        cirugia_adicional_codigo: input.cirugia_adicional_codigo ?? null,
        cirugia_adicional_honorario: input.cirugia_adicional_honorario ?? null,
        rol_medico: input.rol_medico ?? null,
        estado: 'borrador',
      }

      const { data, error } = await supabase
        .from('ordenes')
        .insert(insertData)
        .select('id')
        .single()

      if (error) return { success: false, error: error.message }

      const monto = (input.honorario_calculado ?? 0) + (input.monto_particular ?? 0) + (input.monto_plus ?? 0)
      return {
        success: true,
        id: data.id,
        paciente: input.nombre_paciente,
        obra_social: input.obra_social ?? 'Particular',
        monto_total: monto,
        estado: 'borrador',
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  },
})

// ============================================================================
// Tool 2: registrar_cirugia
// ============================================================================
const practicaAdicionalSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().optional(),
  honorarios: z.number().min(0).default(0),
  gastos: z.number().min(0).default(0),
  porcentaje_reconocido: z
    .number()
    .min(0)
    .max(100)
    .default(70)
    .describe('Porcentaje que la OS reconoce sobre la práctica adicional. Default 70%, editable.'),
})

export const registrarCirugiaTool = tool({
  description: `Registra una cirugía. Puede ser 1° Nivel (ambulatoria en consultorio) o 2° Nivel (en institución como sanatorio).
Para 2° Nivel, la institución es requerida (Pasteur, Junín, Privado, Nosocomio de la Comunidad, etc.).
rol_medico: el médico puede actuar como 'cirujano' o como 'ayudante'. Default 'cirujano'.
fecha_alta_paciente es opcional — solo completarlo si el paciente quedó internado más de un día.
fecha_autorizacion es opcional — fecha en que la OS autoriza/liquida. Si aún no la sabe, dejar vacío.
practicas_adicionales: cirugías agregadas realizadas en el mismo procedimiento (no son complicaciones). La OS reconoce por default 70% — el médico puede modificar ese %.
Estado inicial: 'borrador'.`,
  inputSchema: z.object({
    nombre_paciente: z.string().min(2),
    fecha: z.string().describe('Fecha de la cirugía, YYYY-MM-DD'),
    obra_social: z.string(),
    codigo_practica: z
      .string()
      .optional()
      .describe('Opcional. Si el médico no lo sabe, dejar vacío y guardar como borrador incompleto.'),
    nombre_practica: z
      .string()
      .optional()
      .describe('Opcional. Nombre/descripción de la cirugía.'),
    honorarios: z.number().min(0).default(0),
    gastos: z.number().min(0).default(0),
    nivel: NIVEL_ENUM.default(2),
    agente_facturador: AGENTE_ENUM.default('circulo_medico'),
    institucion: z.string().optional().describe('Requerida si nivel=2'),
    rol_medico: z.enum(['cirujano', 'ayudante']).default('cirujano'),
    nro_historia_clinica: z.string().optional().describe('Nro de historia clínica en la institución'),
    fecha_autorizacion: z
      .string()
      .optional()
      .describe('YYYY-MM-DD, fecha en que la OS autoriza/liquida la práctica. Opcional.'),
    fecha_alta_paciente: z
      .string()
      .optional()
      .describe('YYYY-MM-DD, opcional. Solo si el paciente quedó internado'),
    practicas_adicionales: z
      .array(practicaAdicionalSchema)
      .optional()
      .describe('Cirugías agregadas en el mismo procedimiento, OS reconoce 70% por default.'),
    observaciones: z.string().optional(),
    ayudante: z.string().optional().describe('Nombre del ayudante si el médico es cirujano'),
    anestesiologo: z.string().optional(),
    tipo_anestesia: z.string().optional(),
    duracion_minutos: z.number().int().min(0).optional(),
    sala: z.string().optional(),
  }),
  execute: async (input) => {
    try {
      const { supabase, medicoId } = await requireMedicoId()

      if (input.nivel === 2 && (!input.institucion || !input.institucion.trim())) {
        return { success: false, error: 'Institución es requerida para cirugías de 2° Nivel' }
      }

      const adicionales = input.practicas_adicionales ?? []
      const totalAdicionales = adicionales.reduce(
        (acc, p) => acc + (p.honorarios ?? 0) + (p.gastos ?? 0),
        0,
      )
      const total = input.honorarios + input.gastos + totalAdicionales

      const codigoTrim = input.codigo_practica?.trim() || null
      const nombrePracticaTrim = input.nombre_practica?.trim() || null
      const cirugiaIncompleta = !codigoTrim && !nombrePracticaTrim

      const insertData = {
        medico_id: medicoId,
        nombre_paciente: input.nombre_paciente,
        fecha: input.fecha,
        obra_social: input.obra_social,
        codigo_practica: codigoTrim,
        nombre_practica: nombrePracticaTrim,
        honorarios: input.honorarios,
        gastos: input.gastos,
        total,
        total_calculado: total,
        estado: 'borrador',
        nivel: input.nivel,
        agente_facturador: input.agente_facturador,
        institucion: input.institucion?.trim() || null,
        rol_medico: input.rol_medico,
        nro_historia_clinica: input.nro_historia_clinica?.trim() || null,
        fecha_autorizacion: input.fecha_autorizacion || null,
        fecha_alta_paciente: input.fecha_alta_paciente || null,
        observaciones: input.observaciones ?? null,
        ayudante: input.ayudante ?? null,
        anestesiologo: input.anestesiologo ?? null,
        tipo_anestesia: input.tipo_anestesia ?? null,
        duracion_minutos: input.duracion_minutos ?? null,
        sala: input.sala ?? null,
        practicas_adicionales: adicionales,
      }

      const { data, error } = await supabase
        .from('cirugias')
        .insert(insertData)
        .select('id')
        .single()

      if (error) return { success: false, error: error.message }

      return {
        success: true,
        id: data.id,
        paciente: input.nombre_paciente,
        nivel: input.nivel === 1 ? '1° Nivel' : '2° Nivel',
        rol_medico: input.rol_medico,
        obra_social: input.obra_social,
        institucion: input.institucion ?? null,
        total,
        cantidad_adicionales: adicionales.length,
        codigo_pendiente: cirugiaIncompleta,
        estado: 'borrador',
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  },
})

// ============================================================================
// Tool 3: registrar_debito
// ============================================================================
export const registrarDebitoTool = tool({
  description: `Registra un débito (descuento aplicado por una OS, CM, MG, Comunidad o institución).
Motivos: falta_token, falta_firma, falta_diagnostico, no_autorizada, error_codigo, otro.
aplicado_por indica quién aplicó el descuento — útil para reportes.
Los motivos falta_token/falta_firma/falta_diagnostico/error_codigo se marcan automáticamente como refacturables.`,
  inputSchema: z.object({
    motivo: z.enum(['falta_token', 'falta_firma', 'falta_diagnostico', 'no_autorizada', 'error_codigo', 'otro']),
    monto: z.number().min(0),
    fecha: z.string().describe('YYYY-MM-DD'),
    motivo_detalle: z.string().optional(),
    aplicado_por: z.enum(['circulo_medico', 'institucion', 'medical_group', 'comunidad', 'obra_social']).optional(),
  }),
  execute: async (input) => {
    try {
      const { supabase, medicoId } = await requireMedicoId()
      const refacturables = ['falta_token', 'falta_firma', 'falta_diagnostico', 'error_codigo']
      const refacturable = refacturables.includes(input.motivo)

      const { data, error } = await supabase
        .from('debitos')
        .insert({
          medico_id: medicoId,
          motivo: input.motivo,
          motivo_detalle: input.motivo_detalle ?? null,
          monto: input.monto,
          fecha: input.fecha,
          refacturable,
          refacturado: false,
          aplicado_por: input.aplicado_por ?? null,
          orden_id: null,
          liquidacion_id: null,
        })
        .select('id')
        .single()

      if (error) return { success: false, error: error.message }

      return {
        success: true,
        id: data.id,
        motivo: input.motivo,
        monto: input.monto,
        refacturable,
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  },
})

// ============================================================================
// Tool 4: consultar_nomenclador
// ============================================================================
const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'un', 'una', 'y', 'o', 'en', 'por', 'para', 'con'])

// Solo secciones de prestaciones médicas (confirmado con owner 2026-04-20).
// Se excluyen: bioquimica (laboratorio), odontologia, fonoaudiologia, terapia_ocupacional,
// psicologia, kinesiologia, nutricion, psicomotricidad, psicopedagogia, estimulacion_temprana,
// enfermeria_domicilio, discapacidad_centro_dia, ive, rehabilitacion, psicoterapia_internacion,
// traslados. Si se detecta que falta alguna, se suma a esta lista.
const SECCIONES_MEDICAS = [
  'ambulatorias',
  'modulos_sanatoriales',
  'consultas',
  'internaciones_especiales',
  'radioterapia',
  'psiquiatria',
  'paliativos',
] as const

// Filtro v1 confirmado con owner 2026-05-11 — app para médicos clínicos/cirujanos.
// Excluimos diagnóstico por imágenes, medicina nuclear y hospital de día porque son
// otra especialidad/centro facturador y generan ruido al consultar el nomenclador.
// SE MANTIENEN dentro del nomenclador: electrocardio/holter/ergometría (cardiólogos
// clínicos), endoscopías (gastros/urólogos/gines).
// Reversible: borrar esta constante + su uso en el filtro JS abajo.
// Plan a futuro (Fase 5): reemplazar por columna `especialidades text[]` en
// prestaciones + match con especialidades del perfil del médico logueado.
const EXCLUDE_PATRONES_PREFIJO = /(ECOGRAF|DOPPLER|ECOCARDIO|RADIOGRAF|TOMOGRAF|RESONAN|ANGIORESON|MAMOGRAF|CENTELLO|GAMMACAMARA|HEMODIAL|TRANSFUS|QUIMIOTERAPIA|DIALISIS|MEDICINA NUCLEAR)/i
const EXCLUDE_PATRONES_SIGLA = /\b(RX|TAC|I131)\b/i

function esExcluidaPorRuido(detalle: string | null | undefined): boolean {
  if (!detalle) return false
  return EXCLUDE_PATRONES_PREFIJO.test(detalle) || EXCLUDE_PATRONES_SIGLA.test(detalle)
}

function sanitizeTerm(raw: string): string {
  return raw.replace(/[%,()]/g, ' ').trim()
}

export const consultarNomencladorTool = tool({
  description: `Busca prácticas en el nomenclador OSEP por código o por texto. Devuelve hasta 10 resultados ordenados por relevancia.
Usá esta tool cuando el médico pregunte "cuánto paga X", "qué código es Y", "buscame la consulta oftalmológica", etc.
La búsqueda parte el texto en palabras clave y busca cualquier coincidencia — no necesita texto exacto.`,
  inputSchema: z.object({
    busqueda: z.string().min(1).describe('Código (ej: "420101") o palabras clave (ej: "consulta oftalmológica", "cirugía vesícula")'),
  }),
  execute: async (input) => {
    try {
      const { supabase } = await requireMedicoId()

      const term = sanitizeTerm(input.busqueda)
      const words = term
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))

      let query = supabase
        .from('prestaciones')
        .select('codigo, detalle, honorarios, gastos, total, seccion, categoria')
        .in('seccion', SECCIONES_MEDICAS as unknown as string[])

      if (words.length <= 1 || term.length <= 4) {
        query = query.or(`codigo.ilike.%${term}%,detalle.ilike.%${term}%`)
      } else {
        const filters = [
          `codigo.ilike.%${term}%`,
          ...words.map((w) => `detalle.ilike.%${w}%`),
        ].join(',')
        query = query.or(filters)
      }

      const { data, error } = await query.limit(40)

      if (error) return { success: false, error: error.message, resultados: [] }

      const lcWords = words.map((w) => w.toLowerCase())
      const ranked = (data ?? [])
        .filter((p) => !esExcluidaPorRuido(p.detalle))
        .map((p) => {
          const detalle = (p.detalle ?? '').toLowerCase()
          const codigo = (p.codigo ?? '').toLowerCase()
          let score = 0
          for (const w of lcWords) {
            if (detalle.includes(w)) score += 2
            if (codigo.includes(w)) score += 3
          }
          if (codigo === term.toLowerCase()) score += 10
          if (detalle === term.toLowerCase()) score += 8
          return { p, score }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ p }) => ({
          codigo: p.codigo,
          detalle: p.detalle,
          honorarios: Number(p.honorarios ?? 0),
          gastos: Number(p.gastos ?? 0),
          total: Number(p.total ?? 0),
          seccion: p.seccion,
        }))

      return {
        success: true,
        busqueda: term,
        cantidad: ranked.length,
        resultados: ranked,
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido', resultados: [] }
    }
  },
})

// ============================================================================
// Tool 5: analizar_imagen_orden (OCR multimodal — usa MODELS.vision)
// Schema + prompt compartidos con /api/ocr-orden en @/lib/ai/ocr-orden.
// ============================================================================
export const analizarImagenOrdenTool = tool({
  description: `Analiza una foto de una orden médica en papel (OCR multimodal).
Extrae: paciente, DNI, OS, grupo/nro de afiliado, N° comprobante, código/nombre de práctica, cantidad, importe, diagnóstico, fechas (realización y vencimiento), médico solicitante, agente facturador, token OSEP, firma, horario.
Ejecutá esta tool AUTOMÁTICAMENTE cuando el médico adjunte una imagen.
Devuelve estructura con nivel de confianza y lista de campos dudosos.`,
  inputSchema: z.object({
    imagen_url: z.string().describe('URL o data URL (base64) de la imagen a analizar'),
  }),
  execute: async (input) => {
    try {
      const { object } = await generateObject({
        model: getVisionModel(),
        schema: ordenExtraidaSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: OCR_ORDEN_PROMPT },
              { type: 'image', image: input.imagen_url },
            ],
          },
        ],
      })

      // Subir la foto como comprobante (bucket privado). No bloquea el análisis si falla.
      let imagen_comprobante: string | null = null
      try {
        const { supabase, medicoId } = await requireMedicoId()
        const base64 = input.imagen_url.includes(',') ? input.imagen_url.split(',')[1] : input.imagen_url
        const buffer = Buffer.from(base64, 'base64')
        const path = `${medicoId}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage
          .from('comprobantes')
          .upload(path, buffer, { contentType: 'image/jpeg', upsert: false })
        if (!upErr) imagen_comprobante = path
        else console.error('[ocr] comprobante upload error:', upErr.message)
      } catch (e) {
        console.error('[ocr] comprobante upload failed:', e)
      }

      return {
        success: true,
        imagen_comprobante,
        ...object,
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error analizando imagen' }
    }
  },
})

// ============================================================================
// Tool 6: ayuda_plataforma
// ============================================================================
export const ayudaPlataformaTool = tool({
  description: `Responde dudas del médico sobre cómo usar MediCuenta.
Usá esta tool solo si el médico pregunta explícitamente sobre la plataforma (cómo hacer X, dónde está Y, etc.).
Devuelve la respuesta ya formulada — vos después la explicás en tus palabras al médico.`,
  inputSchema: z.object({
    tema: z.string().describe('Tema sobre el que el médico pregunta (ej: "cómo presentar órdenes", "exportar a Excel", "dónde veo mis débitos")'),
  }),
  execute: async (input) => {
    const tema = input.tema.toLowerCase()
    const tips: Record<string, string> = {
      presentar: 'En /ordenes, tildá el checkbox del header para seleccionar todos los borradores visibles, después click en "Marcar como presentadas". También podés filtrar por agente facturador antes del batch.',
      exportar: 'Botón "Exportar" en /ordenes o /cirugias baja un Excel con los filtros aplicados.',
      cobrado: 'En /dashboard tenés el KPI "Cobrado" del mes. En /reportes podés ver la evolución mensual y filtrar por OS o agente facturador.',
      nomenclador: 'Dos opciones: ir a /nomenclador o pedírmelo a mí directamente con una búsqueda.',
      debito: 'Cargá el débito en /debitos/nuevo o pedime que lo registre. Motivos como falta_token o falta_firma se marcan automáticamente como refacturables.',
      cirugia: 'Las cirugías se cargan SOLO por voz: decime los datos (paciente, OS, cirugía principal, adicionales, rol) y te guío con preguntas hasta completarla. No hay formulario manual ni carga por foto.',
      reporte: 'En /reportes tenés KPIs, 6 gráficos y tabla 12 meses. Filtros por período, OS, tipo, nivel, agente e institución.',
    }
    const matched = Object.entries(tips).find(([k]) => tema.includes(k))
    return {
      success: true,
      respuesta: matched ? matched[1] : 'Preguntame algo más específico (ej: cómo presentar órdenes, cómo exportar a Excel, etc.) y te explico.',
    }
  },
})

// ============================================================================
// Tool 7: navegar (CLIENT-SIDE — sin execute, se resuelve en el navegador)
// ============================================================================
// Esta tool NO tiene execute. El modelo emite la llamada y el cliente la
// intercepta en useChat.onToolCall para hacer router.push().
export const navegarTool = tool({
  description: `Lleva al médico a una sección de la app. Usá esta tool cuando el médico te diga "llevame a", "mostrame", "quiero ver", "abrí", "ir a" + nombre de sección.

Ejemplos:
- "Llevame a mis órdenes" → navegar({ destino: 'ordenes' })
- "Quiero cargar una orden nueva" → navegar({ destino: 'nueva_orden' })
- "Mostrame el dashboard" → navegar({ destino: 'dashboard' })
- "Abrí el nomenclador" → navegar({ destino: 'nomenclador' })
- "Llevame a mis conversaciones" → navegar({ destino: 'conversaciones' })
- "Mostrame la agenda" → navegar({ destino: 'agenda' })
- "Abrí mis pacientes" → navegar({ destino: 'pacientes' })
- "Llevame a mi asistente de turnos" / "configurá el bot de turnos" → navegar({ destino: 'asistente_turnos' })

Después de navegar se abre la sección: en escritorio el chat queda como panel lateral; en el celular la sección ocupa la pantalla en modo app (con el menú abajo y el asistente como botón flotante). NO confirmes antes de navegar, hacelo directo. Sí podés agregar una frase corta de contexto al responder (ej: "Listo, te llevo a tus órdenes").`,
  inputSchema: z.object({
    destino: z.enum(NAVIGATION_DESTINATIONS as unknown as [string, ...string[]]).describe('Sección destino. Usá uno de los valores válidos del enum.'),
  }),
  // ↓ NO execute: tool de cliente
})

// ============================================================================
// Export registry
// ============================================================================
export const assistantTools = {
  registrar_orden: registrarOrdenTool,
  registrar_debito: registrarDebitoTool,
  consultar_nomenclador: consultarNomencladorTool,
  analizar_imagen_orden: analizarImagenOrdenTool,
  ayuda_plataforma: ayudaPlataformaTool,
  navegar: navegarTool,
}

export type AssistantToolName = keyof typeof assistantTools
