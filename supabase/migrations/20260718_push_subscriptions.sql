-- Suscripciones a notificaciones push (Web Push / VAPID) de la PWA.
-- Cada dispositivo/navegador donde el usuario aceptó notificaciones = una fila.
-- Un mismo usuario puede tener varias (celular + escritorio) → UNIQUE(user_id, endpoint).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,           -- URL del push service (FCM/Apple/Mozilla)
  p256dh       text NOT NULL,           -- clave pública del cliente (cifrado del payload)
  auth         text NOT NULL,           -- secreto de autenticación del cliente
  user_agent   text,
  created_at   timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- El usuario solo ve/crea/borra SUS propias suscripciones. El envío de push corre
-- server-side con service_role (bypassa RLS), así que no necesita policy de lectura amplia.
CREATE POLICY "Usuarios leen sus suscripciones" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean sus suscripciones" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios actualizan sus suscripciones" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuarios borran sus suscripciones" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
