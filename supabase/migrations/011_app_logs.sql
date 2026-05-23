-- App-wide logging table for error tracking, diagnostics, and admin visibility

CREATE TABLE IF NOT EXISTS public.app_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level       text NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  category    text NOT NULL CHECK (category IN ('auth', 'generation', 'data', 'share', 'profile', 'edge', 'system')),
  message     text NOT NULL,
  metadata    jsonb DEFAULT '{}',
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  trip_id     uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  source      text NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'edge')),
  user_agent  text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON public.app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_category ON public.app_logs (category);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id ON public.app_logs (user_id);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all logs"
  ON public.app_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Authenticated users can insert logs"
  ON public.app_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete logs"
  ON public.app_logs FOR DELETE
  USING (public.is_admin());
