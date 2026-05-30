-- 202605270001_board_visibility_and_tiers.sql
--
-- 1. Board opt-in: add `is_public` / `is_demo` to probes. Default FALSE so
--    user probes are PRIVATE until they explicitly publish.
-- 2. Update the new-user trigger to seed Free tier with 24 probes/month
--    (was 15) to match the new pricing page.
-- 3. (Idempotent — safe to re-run.)

-- 1. Board visibility columns ----------------------------------------------
ALTER TABLE public.probes
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.probes
  ADD COLUMN IF NOT EXISTS is_demo   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_probes_visibility
  ON public.probes (is_public, is_demo, created_at DESC);

-- 2. RLS: allow anyone (anon + authenticated) to SELECT public/demo rows
-- so the leaderboard works for logged-out visitors. Owner-private rows
-- remain gated by the existing probes_select_own policy.
DROP POLICY IF EXISTS "probes_select_public_board" ON public.probes;
CREATE POLICY "probes_select_public_board"
  ON public.probes
  FOR SELECT
  TO anon, authenticated
  USING (is_public = TRUE OR is_demo = TRUE);

-- 3. New-user trigger: seed Free tier at 24 probes/month (was 15).
--    Existing free profiles keep whatever limit they already have; this only
--    affects rows created from this point forward.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, subscription_tier, probes_used_this_month, probes_limit, month_started_at)
  VALUES (NEW.id, NEW.email, 'free', 0, 24, NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. Bring EXISTING free profiles up to the new 24 cap (only if they're still
--    on the old default of 15 / 3 — don't clobber Enterprise customizations).
UPDATE public.profiles
   SET probes_limit = 24
 WHERE subscription_tier = 'free'
   AND probes_limit IN (3, 15);

-- Done.
