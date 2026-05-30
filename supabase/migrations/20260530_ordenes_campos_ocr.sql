-- Campos adicionales de órdenes extraídos del OCR / presentes en la orden OSEP.
-- Idempotente: se puede correr múltiples veces sin error.

alter table ordenes
  add column if not exists nro_documento       text,
  add column if not exists nro_comprobante     text,
  add column if not exists grupo_afiliado      text,
  add column if not exists fecha_vencimiento   date,
  add column if not exists cantidad            numeric(10,2) default 1,
  add column if not exists medico_solicitante  text,
  add column if not exists horario_realizacion text;

comment on column ordenes.nro_documento       is 'DNI del beneficiario (OCR)';
comment on column ordenes.nro_comprobante      is 'N° de comprobante OSEP — identificador único de la orden';
comment on column ordenes.grupo_afiliado       is 'Grupo del afiliado (va junto al N° afiliado en OSEP)';
comment on column ordenes.fecha_vencimiento    is 'Fecha de vencimiento de la orden (plazo de presentación)';
comment on column ordenes.cantidad             is 'Cantidad de la práctica';
comment on column ordenes.medico_solicitante   is 'Médico prescriptor / solicitante';
comment on column ordenes.horario_realizacion  is 'Hora de realización (HH:MM)';
