-- Captura COMPLETA de la orden OSEP: todos los campos restantes del comprobante.
-- Idempotente: se puede correr múltiples veces sin error.
-- (Complementa 20260530_ordenes_campos_ocr.sql)

alter table ordenes
  -- Cabecera
  add column if not exists delegacion           text,
  add column if not exists titulo_autorizacion  text,
  add column if not exists nro_internacion       text,
  -- Fechas
  add column if not exists fecha_solicitud       date,
  add column if not exists fecha_prescripcion    date,
  add column if not exists fecha_emision         date,
  add column if not exists hora_emision          text,
  -- Titular / beneficiario
  add column if not exists titular_nombre        text,
  add column if not exists cobertura             text,
  add column if not exists parentesco            text,
  -- Documento
  add column if not exists domicilio             text,
  add column if not exists tipo_documento        text,
  -- Práctica
  add column if not exists alias                 text,
  add column if not exists cara                  text,
  add column if not exists pieza                 text,
  -- Pago
  add column if not exists forma_pago            text,
  add column if not exists cod_pago              text,
  add column if not exists origen                text,
  -- Diagnóstico / arancel
  add column if not exists arancelista           text,
  add column if not exists cajero                text,
  -- Total
  add column if not exists total_cargo_afiliado  numeric(12,2),
  -- Profesional
  add column if not exists matricula_profesional text,
  add column if not exists profesional           text,
  add column if not exists entidad               text,
  add column if not exists responsable           text;
