-- ============================================================================
-- F4.3 (fase 2) — La prueba de 14 días se crea SOLA al dar de alta un médico.
-- Spec: docs/superpowers/specs/2026-07-16-mp-suscripcion-saas-design.md (R1, R2).
--
-- El agujero que tapa: el alta NUNCA tocaba `suscripciones`. Un médico nuevo quedaba
-- SIN fila → `normalizarPlan` lo trataba como básico, sin prueba y sin `trial_ends_at`.
-- La prueba solo arrancaba si el superadmin le ponía estado='prueba' a mano.
--
-- Por qué va en el trigger y no en una server action: `handle_new_user` es el ÚNICO
-- punto por el que pasan TODAS las altas (signup propio, invitación del superadmin,
-- createUser del onboarding autoservicio). Cualquier otro lugar deja caminos afuera.
-- ============================================================================

-- ── 1) El trigger de signup, extendido ──────────────────────────────────────
-- Se recrea COMPLETO (viene de 20260612_fase3b_secretaria.sql) porque no se puede
-- parchear el cuerpo. Lo único nuevo es el bloque de `suscripciones` al final.
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
    -- Claim en el JWT para el guard de rutas del middleware (lee app_metadata, sin query a la DB).
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', 'secretaria')
    WHERE id = NEW.id;
    UPDATE public.equipo_consultorio
    SET secretaria_id = NEW.id, estado = 'activa', accepted_at = now()
    WHERE lower(secretaria_email) = lower(NEW.email) AND estado = 'pendiente';
  END IF;

  -- ── NUEVO (F4.3 R1/R2) ────────────────────────────────────────────────────
  -- El médico arranca probando el plan FULL 14 días, SIN pedirle tarjeta: la prueba
  -- es nuestra (`trial_ends_at`), no de MercadoPago. El `preapproval` recién se crea
  -- cuando decide pagar. La secretaria NO tiene suscripción propia: hereda el estado
  -- del médico al que asiste.
  --
  -- Es `= 'medico'` explícito y no un ELSE: si mañana aparece otro rol, que NO reciba
  -- una suscripción por descuido.
  --
  -- ⚠ Los 14 días están duplicados: acá y en TRIAL_DIAS (src/lib/admin/planes.ts),
  -- que usa `setSuscripcion` del panel. Si cambia uno, cambiar el otro.
  IF v_rol = 'medico' THEN
    INSERT INTO public.suscripciones (medico_id, plan, estado, trial_ends_at)
    VALUES (NEW.id, 'full', 'prueba', now() + interval '14 days')
    ON CONFLICT (medico_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2) Backfill: ningún médico puede quedar sin fila ────────────────────────
-- Hoy esto afecta 0 filas (los 4 médicos reales ya tienen la suya, sembrada en
-- 20260612 como full/activa, y esas NO se tocan por el ON CONFLICT). Va igual por si
-- alguien se registra entre este deploy y el anterior: le corresponde su prueba.
INSERT INTO public.suscripciones (medico_id, plan, estado, trial_ends_at)
SELECT p.id, 'full', 'prueba', now() + interval '14 days'
FROM public.perfiles p
WHERE p.rol IS DISTINCT FROM 'secretaria'
ON CONFLICT (medico_id) DO NOTHING;

-- ── 3) Índice para el cron de reconciliación ────────────────────────────────
-- El cron barre a diario `estado='prueba' AND trial_ends_at <= now()`.
CREATE INDEX IF NOT EXISTS idx_suscripciones_trial
  ON public.suscripciones (estado, trial_ends_at)
  WHERE estado = 'prueba';

COMMENT ON COLUMN public.suscripciones.trial_ends_at IS
  'Fin de la prueba de 14 días (F4.3 R1). Lo escribe handle_new_user al alta. El candado '
  'lo compara EN VIVO contra now() (resolverAcceso); el cron solo reconcilia el estado.';
