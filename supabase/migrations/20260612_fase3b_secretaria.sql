-- ============================================================================
-- Fase 3B — La secretaria (acceso delegado)
-- Spec: docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md §7, §10
-- Plan: docs/superpowers/plans/2026-06-12-fase3b-secretaria.md
--
-- Garantía por construcción: facturación y recetas NUNCA se delegan. El auth.uid()
-- de la secretaria jamás es igual al medico_id de esas tablas y no agregamos ningún
-- camino de delegación ahí → su cliente no puede leerlas, le pegue como le pegue.
-- ============================================================================

-- ── Vínculo médico ↔ secretaria ─────────────────────────────────────────────
CREATE TABLE equipo_consultorio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secretaria_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- null hasta el signup
  secretaria_email TEXT NOT NULL,                                  -- canónico (minúsculas)
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'activa', 'revocada')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (medico_id, secretaria_email)
);
CREATE INDEX idx_equipo_medico ON equipo_consultorio(medico_id);
CREATE INDEX idx_equipo_secretaria ON equipo_consultorio(secretaria_id);
CREATE INDEX idx_equipo_email_pendiente ON equipo_consultorio(lower(secretaria_email)) WHERE estado = 'pendiente';

ALTER TABLE equipo_consultorio ENABLE ROW LEVEL SECURITY;
-- El médico gestiona (CRUD) sus propios vínculos.
CREATE POLICY "equipo_medico_all" ON equipo_consultorio
  FOR ALL USING (medico_id = auth.uid()) WITH CHECK (medico_id = auth.uid());
-- La secretaria SOLO lee los vínculos donde ella es la secretaria (para el selector).
CREATE POLICY "equipo_secretaria_select" ON equipo_consultorio
  FOR SELECT USING (secretaria_id = auth.uid());

-- ── Función de acceso delegado (el corazón de la RLS de 3B) ──────────────────
-- SECURITY DEFINER para leer equipo_consultorio sin recursión de RLS; search_path fijo.
CREATE OR REPLACE FUNCTION public.puede_acceder_consultorio(target_medico UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_medico = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.equipo_consultorio
        WHERE medico_id = target_medico
          AND secretaria_id = auth.uid()
          AND estado = 'activa'
      );
$$;
-- EXECUTE queda en PUBLIC a propósito: las policies RLS la invocan para CUALQUIER rol al
-- evaluar el acceso (sin EXECUTE el SELECT fallaría con "permission denied for function").
-- Solo revela el booleano de acceso del propio caller (anon → auth.uid() null → siempre
-- false): no filtra datos. El advisor la marca como SECURITY DEFINER ejecutable: es intencional.

-- ── uid por email (para vincular cuentas YA existentes desde la acción del médico) ──
-- Solo service-role la ejecuta (execute revocado): evita enumeración de emails.
CREATE OR REPLACE FUNCTION public.uid_por_email(p_email TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;
-- En Postgres el EXECUTE por defecto va a PUBLIC: revocar de anon/authenticated NO basta.
-- Revocamos de PUBLIC y concedemos SOLO a service-role (lo llama la acción de invitar del médico).
REVOKE EXECUTE ON FUNCTION public.uid_por_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uid_por_email(TEXT) TO service_role;

-- ── Trigger de signup extendido: claim de invitación por email ───────────────
-- Si el email del nuevo usuario tiene una invitación 'pendiente' → rol 'secretaria'
-- + activa TODAS sus invitaciones (multi-consultorio). La verificación de email de
-- Supabase es la prueba de propiedad. Mantiene el comportamiento previo para médicos.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_es_secretaria BOOLEAN;
  v_rol TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.equipo_consultorio
    WHERE lower(secretaria_email) = lower(NEW.email) AND estado = 'pendiente'
  ) INTO v_es_secretaria;

  v_rol := CASE WHEN v_es_secretaria THEN 'secretaria'
                ELSE COALESCE(NEW.raw_user_meta_data->>'rol', 'medico') END;

  INSERT INTO public.perfiles (id, nombre, apellido, rol)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'nombre',
    NEW.raw_user_meta_data->>'apellido',
    v_rol
  );

  IF v_es_secretaria THEN
    UPDATE public.equipo_consultorio
    SET secretaria_id = NEW.id, estado = 'activa', accepted_at = now()
    WHERE lower(secretaria_email) = lower(NEW.email) AND estado = 'pendiente';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Delegación COMPLETA (select+insert+update+delete) ───────────────────────
-- wa_turnos, wa_sobreturnos, wa_contactos, wa_conversaciones, wa_mensajes,
-- wa_pacientes, wa_excepciones. Se agrega WITH CHECK a UPDATE (antes solo USING)
-- para que nadie cambie medico_id y se escape del consultorio.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wa_turnos','wa_sobreturnos','wa_contactos','wa_conversaciones',
    'wa_mensajes','wa_pacientes','wa_excepciones'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.puede_acceder_consultorio(medico_id))', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.puede_acceder_consultorio(medico_id))', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.puede_acceder_consultorio(medico_id)) WITH CHECK (public.puede_acceder_consultorio(medico_id))', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.puede_acceder_consultorio(medico_id))', t||'_delete', t);
  END LOOP;
END $$;

-- ── wa_bitacora: SELECT + INSERT delegados (las acciones de la secretaria quedan
-- en la bitácora con medico_id correcto + origen 'panel'). No tiene update/delete.
DROP POLICY IF EXISTS "wa_bitacora_select" ON public.wa_bitacora;
DROP POLICY IF EXISTS "wa_bitacora_insert" ON public.wa_bitacora;
CREATE POLICY "wa_bitacora_select" ON public.wa_bitacora FOR SELECT USING (public.puede_acceder_consultorio(medico_id));
CREATE POLICY "wa_bitacora_insert" ON public.wa_bitacora FOR INSERT WITH CHECK (public.puede_acceder_consultorio(medico_id));

-- ── Delegación SOLO-SELECT: wa_horarios, wa_servicios ───────────────────────
-- La agenda los lee para calcular huecos; la escritura (cambiar horarios/duración)
-- sigue médico-only (es config). Solo recreamos SELECT; insert/update/delete intactos.
DROP POLICY IF EXISTS "wa_horarios_select" ON public.wa_horarios;
CREATE POLICY "wa_horarios_select" ON public.wa_horarios FOR SELECT USING (public.puede_acceder_consultorio(medico_id));
DROP POLICY IF EXISTS "wa_servicios_select" ON public.wa_servicios;
CREATE POLICY "wa_servicios_select" ON public.wa_servicios FOR SELECT USING (public.puede_acceder_consultorio(medico_id));

-- INTACTAS (médico-only, NO se tocan): wa_config_agente, wa_canales, wa_os_suspendidas,
-- wa_eventos_webhook, mp_conexiones, recetas, recetas_cobro, ordenes, liquidaciones,
-- debitos, cirugias, chat_conversaciones, chat_mensajes, perfiles, nomenclador.
