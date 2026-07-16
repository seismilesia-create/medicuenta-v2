-- La conversación del MÉDICO con su propio bot no es una conversación de paciente:
-- no va en la bandeja de Conversaciones (el médico la lee en su celular).
-- Sigue existiendo porque el agente necesita el historial para el multi-turno.
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS es_medico BOOLEAN NOT NULL DEFAULT false;

-- Backfill: marcar las que ya existen (creadas antes de este flag).
-- Comparación por los últimos 10 dígitos: los formatos guardados pueden diferir (+54 / 9 / 0 / 15).
UPDATE wa_conversaciones c
SET es_medico = true
FROM wa_contactos ct, wa_asignaciones a
WHERE c.contacto_id = ct.id
  AND c.medico_id = a.medico_id
  -- Últimos 10 dígitos = número nacional argentino: inmune a las variantes de prefijo
  -- (54 / 549 / 0 / 15). wa_contactos.telefono llega crudo del webhook (549…, 13 dígitos)
  -- y wa_asignaciones.numero_personal pasa por normalizarWhatsappAr (54…, 12 dígitos, SIN el 9),
  -- así que comparar los strings completos matchea 0 filas siempre.
  AND right(regexp_replace(ct.telefono, '\D', '', 'g'), 10)
    = right(regexp_replace(a.numero_personal, '\D', '', 'g'), 10);
