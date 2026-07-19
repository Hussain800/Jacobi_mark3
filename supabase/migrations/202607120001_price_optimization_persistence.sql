-- Price-optimization persistence foundation.
--
-- Consumer comparison data is deliberately separate from the legacy
-- enterprise `products` / watchlist schema. Catalog writes and observation
-- writes are service-role operations. Authenticated users can read shared
-- catalog observations and manage only their own comparisons, watches, and
-- preferences. Anonymous comparison rows (user_id IS NULL) remain accessible
-- only through the backend service role.

BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_products (
  product_id TEXT PRIMARY KEY CHECK (char_length(product_id) BETWEEN 1 AND 200),
  canonical_id TEXT,
  brand TEXT,
  model TEXT,
  mpn TEXT,
  primary_gtin TEXT,
  identity_hash TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_aliases (
  alias_id TEXT PRIMARY KEY CHECK (char_length(alias_id) BETWEEN 1 AND 200),
  product_id TEXT NOT NULL REFERENCES public.catalog_products(product_id) ON DELETE CASCADE,
  alias_type TEXT,
  alias_value TEXT,
  normalized_value TEXT,
  source TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.offer_observations (
  observation_id TEXT PRIMARY KEY CHECK (char_length(observation_id) BETWEEN 1 AND 200),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES public.catalog_products(product_id) ON DELETE SET NULL,
  evidence_manifest_id TEXT,
  merchant_id TEXT,
  seller_name TEXT,
  source_url TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  currency TEXT CHECK (currency IS NULL OR char_length(currency) BETWEEN 3 AND 8),
  item_amount NUMERIC(20, 6),
  payable_amount NUMERIC(20, 6),
  total_complete BOOLEAN NOT NULL DEFAULT FALSE,
  fixture BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comparison_runs (
  comparison_id TEXT PRIMARY KEY CHECK (char_length(comparison_id) BETWEEN 1 AND 200),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES public.catalog_products(product_id) ON DELETE SET NULL,
  evidence_manifest_id TEXT,
  request_id TEXT,
  market TEXT NOT NULL DEFAULT 'AE' CHECK (char_length(market) BETWEEN 2 AND 8),
  status TEXT NOT NULL DEFAULT 'completed',
  partial BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.comparison_candidates (
  candidate_id TEXT PRIMARY KEY CHECK (char_length(candidate_id) BETWEEN 1 AND 200),
  comparison_id TEXT NOT NULL REFERENCES public.comparison_runs(comparison_id) ON DELETE CASCADE,
  offer_observation_id TEXT REFERENCES public.offer_observations(observation_id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  classification TEXT CHECK (
    classification IS NULL OR classification IN (
      'EXACT_EQUIVALENT',
      'EQUIVALENT_WITH_DISCLOSED_TRADEOFF',
      'SIMILAR_NOT_EQUIVALENT',
      'REJECTED'
    )
  ),
  eligible BOOLEAN NOT NULL DEFAULT FALSE,
  rank INTEGER CHECK (rank IS NULL OR rank > 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.optimization_evidence_references (
  reference_id TEXT PRIMARY KEY CHECK (char_length(reference_id) BETWEEN 1 AND 200),
  comparison_id TEXT REFERENCES public.comparison_runs(comparison_id) ON DELETE CASCADE,
  offer_observation_id TEXT REFERENCES public.offer_observations(observation_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  manifest_id TEXT,
  artifact_hash TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT optimization_evidence_parent_check CHECK (
    comparison_id IS NOT NULL OR offer_observation_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.comparison_events (
  event_id TEXT PRIMARY KEY CHECK (char_length(event_id) BETWEEN 1 AND 200),
  comparison_id TEXT NOT NULL REFERENCES public.comparison_runs(comparison_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.price_watches (
  watch_id TEXT PRIMARY KEY CHECK (char_length(watch_id) BETWEEN 1 AND 200),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES public.catalog_products(product_id) ON DELETE CASCADE,
  offer_observation_id TEXT REFERENCES public.offer_observations(observation_id) ON DELETE CASCADE,
  target_amount NUMERIC(20, 6),
  currency TEXT CHECK (currency IS NULL OR char_length(currency) BETWEEN 3 AND 8),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT price_watch_target_check CHECK (
    product_id IS NOT NULL OR offer_observation_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_aliases_unique_normalized
  ON public.product_aliases(product_id, alias_type, normalized_value)
  WHERE normalized_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_products_brand_model
  ON public.catalog_products(brand, model);
CREATE INDEX IF NOT EXISTS idx_catalog_products_gtin
  ON public.catalog_products(primary_gtin) WHERE primary_gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offer_observations_product_observed
  ON public.offer_observations(product_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_observations_merchant_observed
  ON public.offer_observations(merchant_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_observations_user_observed
  ON public.offer_observations(user_id, observed_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comparison_runs_user_created
  ON public.comparison_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comparison_runs_product_created
  ON public.comparison_runs(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comparison_candidates_comparison_rank
  ON public.comparison_candidates(comparison_id, rank NULLS LAST, created_at);
CREATE INDEX IF NOT EXISTS idx_comparison_evidence_comparison
  ON public.optimization_evidence_references(comparison_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comparison_events_comparison_created
  ON public.comparison_events(comparison_id, created_at);
CREATE INDEX IF NOT EXISTS idx_price_watches_user_active
  ON public.price_watches(user_id, active, created_at DESC);

DROP TRIGGER IF EXISTS trg_catalog_products_updated_at ON public.catalog_products;
CREATE TRIGGER trg_catalog_products_updated_at
  BEFORE UPDATE ON public.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_offer_observations_updated_at ON public.offer_observations;
CREATE TRIGGER trg_offer_observations_updated_at
  BEFORE UPDATE ON public.offer_observations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_comparison_runs_updated_at ON public.comparison_runs;
CREATE TRIGGER trg_comparison_runs_updated_at
  BEFORE UPDATE ON public.comparison_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_price_watches_updated_at ON public.price_watches;
CREATE TRIGGER trg_price_watches_updated_at
  BEFORE UPDATE ON public.price_watches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparison_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparison_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_evidence_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparison_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_products_authenticated_read ON public.catalog_products;
CREATE POLICY catalog_products_authenticated_read
  ON public.catalog_products FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS product_aliases_authenticated_read ON public.product_aliases;
CREATE POLICY product_aliases_authenticated_read
  ON public.product_aliases FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS offer_observations_authenticated_read ON public.offer_observations;
CREATE POLICY offer_observations_authenticated_read
  ON public.offer_observations FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comparison_runs_owner_select ON public.comparison_runs;
CREATE POLICY comparison_runs_owner_select
  ON public.comparison_runs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS comparison_runs_owner_insert ON public.comparison_runs;
CREATE POLICY comparison_runs_owner_insert
  ON public.comparison_runs FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS comparison_runs_owner_update ON public.comparison_runs;
CREATE POLICY comparison_runs_owner_update
  ON public.comparison_runs FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS comparison_runs_owner_delete ON public.comparison_runs;
CREATE POLICY comparison_runs_owner_delete
  ON public.comparison_runs FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comparison_candidates_owner_read ON public.comparison_candidates;
CREATE POLICY comparison_candidates_owner_read
  ON public.comparison_candidates FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS optimization_evidence_owner_read ON public.optimization_evidence_references;
CREATE POLICY optimization_evidence_owner_read
  ON public.optimization_evidence_references FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comparison_events_owner_read ON public.comparison_events;
CREATE POLICY comparison_events_owner_read
  ON public.comparison_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS price_watches_owner_all ON public.price_watches;
CREATE POLICY price_watches_owner_all
  ON public.price_watches FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_preferences_owner_all ON public.user_preferences;
CREATE POLICY user_preferences_owner_all
  ON public.user_preferences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.catalog_products FROM anon;
REVOKE ALL ON TABLE public.product_aliases FROM anon;
REVOKE ALL ON TABLE public.offer_observations FROM anon;
REVOKE ALL ON TABLE public.comparison_runs FROM anon;
REVOKE ALL ON TABLE public.comparison_candidates FROM anon;
REVOKE ALL ON TABLE public.optimization_evidence_references FROM anon;
REVOKE ALL ON TABLE public.comparison_events FROM anon;
REVOKE ALL ON TABLE public.price_watches FROM anon;
REVOKE ALL ON TABLE public.user_preferences FROM anon;

GRANT SELECT ON TABLE public.catalog_products TO authenticated;
GRANT SELECT ON TABLE public.product_aliases TO authenticated;
GRANT SELECT ON TABLE public.offer_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comparison_runs TO authenticated;
GRANT SELECT ON TABLE public.comparison_candidates TO authenticated;
GRANT SELECT ON TABLE public.optimization_evidence_references TO authenticated;
GRANT SELECT ON TABLE public.comparison_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.price_watches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_preferences TO authenticated;

GRANT ALL ON TABLE public.catalog_products TO service_role;
GRANT ALL ON TABLE public.product_aliases TO service_role;
GRANT ALL ON TABLE public.offer_observations TO service_role;
GRANT ALL ON TABLE public.comparison_runs TO service_role;
GRANT ALL ON TABLE public.comparison_candidates TO service_role;
GRANT ALL ON TABLE public.optimization_evidence_references TO service_role;
GRANT ALL ON TABLE public.comparison_events TO service_role;
GRANT ALL ON TABLE public.price_watches TO service_role;
GRANT ALL ON TABLE public.user_preferences TO service_role;

COMMIT;
