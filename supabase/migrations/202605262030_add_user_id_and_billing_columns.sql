-- Adds the columns the Stripe + quota work needs.
-- Safe to apply on top of 202605260001_create_jacobi_tables.sql.

-- 1. probes.user_id — link each probe to the user who ran it.
ALTER TABLE public.probes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_probes_user_id ON public.probes(user_id);

-- 2. profiles.month_started_at — anchor for calendar-month quota rollover.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS month_started_at TIMESTAMPTZ DEFAULT NOW();

-- 3. RLS policy refresh on probes (the original migration referenced user_id
-- before the column existed, so the policies were inert). Recreate them now.
DROP POLICY IF EXISTS "probes_select_own" ON public.probes;
DROP POLICY IF EXISTS "probes_insert_own" ON public.probes;
DROP POLICY IF EXISTS "probes_delete_own" ON public.probes;

CREATE POLICY "probes_select_own"
  ON public.probes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "probes_insert_own"
  ON public.probes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "probes_delete_own"
  ON public.probes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- The backend writes via the service role key, which bypasses RLS, so existing
-- save_probe() flows continue to work and now correctly stamp user_id.

-- 4. Auto-create a profile row on signup so the quota counter has a home.
-- This trigger guarantees ensure_profile() can always succeed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, subscription_tier, probes_used_this_month, probes_limit, month_started_at)
  VALUES (NEW.id, NEW.email, 'free', 0, 15, NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
