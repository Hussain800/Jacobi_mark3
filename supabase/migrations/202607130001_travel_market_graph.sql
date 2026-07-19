-- Travel Market Graph persistence foundation.
--
-- User-owned and anonymous-capability searches are exposed only through the
-- backend repository. Shared itinerary/property observations are service-only.
-- Raw provider payloads, credentials, full redirect URLs and capability tokens
-- are deliberately absent from this schema.

BEGIN;

CREATE TABLE IF NOT EXISTS public.travel_searches (
  search_id TEXT PRIMARY KEY CHECK (char_length(search_id) BETWEEN 1 AND 200),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_hash TEXT,
  fingerprint TEXT NOT NULL CHECK (char_length(fingerprint) BETWEEN 16 AND 200),
  vertical TEXT NOT NULL CHECK (vertical IN ('flight', 'hotel')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled', 'expired')
  ),
  market TEXT NOT NULL CHECK (char_length(market) BETWEEN 2 AND 12),
  intent JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(intent::text) <= 32768),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 32768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT travel_search_access_check CHECK (
    user_id IS NOT NULL OR capability_hash IS NOT NULL
  ),
  CONSTRAINT travel_search_capability_hash_check CHECK (
    capability_hash IS NULL OR capability_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE IF NOT EXISTS public.travel_provider_attempts (
  attempt_id TEXT PRIMARY KEY CHECK (char_length(attempt_id) BETWEEN 1 AND 200),
  search_id TEXT NOT NULL REFERENCES public.travel_searches(search_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 80),
  provider_environment TEXT NOT NULL CHECK (
    provider_environment IN ('fixture', 'sandbox', 'test', 'production', 'unknown')
  ),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'timeout', 'rate_limited', 'cancelled')
  ),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) <= 120),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count BETWEEN 0 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    octet_length(payload::text) <= 32768
    AND NOT (payload ?| ARRAY[
      'access_token', 'api_key', 'authorization', 'cookie', 'cookies', 'html',
      'raw_body', 'raw_payload', 'raw_request', 'raw_response',
      'request_headers', 'response_body', 'response_headers', 'secret', 'token'
    ])
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_flight_itineraries (
  itinerary_id TEXT PRIMARY KEY CHECK (char_length(itinerary_id) BETWEEN 1 AND 200),
  canonical_hash TEXT NOT NULL UNIQUE CHECK (canonical_hash ~ '^[0-9a-f]{64}$'),
  origin TEXT NOT NULL CHECK (char_length(origin) BETWEEN 3 AND 8),
  destination TEXT NOT NULL CHECK (char_length(destination) BETWEEN 3 AND 8),
  departure_date DATE NOT NULL,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(segments) = 'array' AND octet_length(segments::text) <= 65536
  ),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 131072),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_hotel_properties (
  property_id TEXT PRIMARY KEY CHECK (char_length(property_id) BETWEEN 1 AND 200),
  canonical_hash TEXT NOT NULL UNIQUE CHECK (canonical_hash ~ '^[0-9a-f]{64}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  city_code TEXT CHECK (city_code IS NULL OR char_length(city_code) BETWEEN 2 AND 12),
  country_code TEXT CHECK (country_code IS NULL OR char_length(country_code) BETWEEN 2 AND 3),
  latitude NUMERIC(9, 6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 65536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_hotel_property_crosswalks (
  crosswalk_id TEXT PRIMARY KEY CHECK (char_length(crosswalk_id) BETWEEN 1 AND 200),
  property_id TEXT NOT NULL REFERENCES public.travel_hotel_properties(property_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 80),
  provider_property_id TEXT NOT NULL CHECK (char_length(provider_property_id) BETWEEN 1 AND 300),
  confidence NUMERIC(5, 4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_id TEXT,
  verified_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 32768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_property_id)
);

CREATE TABLE IF NOT EXISTS public.travel_offers (
  offer_id TEXT PRIMARY KEY CHECK (char_length(offer_id) BETWEEN 1 AND 200),
  search_id TEXT NOT NULL REFERENCES public.travel_searches(search_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_attempt_id TEXT REFERENCES public.travel_provider_attempts(attempt_id) ON DELETE SET NULL,
  itinerary_id TEXT REFERENCES public.travel_flight_itineraries(itinerary_id) ON DELETE RESTRICT,
  hotel_property_id TEXT REFERENCES public.travel_hotel_properties(property_id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 80),
  supplier_id TEXT CHECK (supplier_id IS NULL OR char_length(supplier_id) <= 200),
  vertical TEXT NOT NULL CHECK (vertical IN ('flight', 'hotel')),
  currency TEXT NOT NULL CHECK (char_length(currency) BETWEEN 3 AND 8),
  item_amount NUMERIC(20, 6) CHECK (item_amount IS NULL OR item_amount >= 0),
  total_amount NUMERIC(20, 6) CHECK (total_amount IS NULL OR total_amount >= 0),
  total_complete BOOLEAN NOT NULL DEFAULT FALSE,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  deep_link_ref TEXT CHECK (deep_link_ref IS NULL OR char_length(deep_link_ref) <= 500),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 131072),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT travel_offer_subject_check CHECK (
    (itinerary_id IS NOT NULL)::INTEGER + (hotel_property_id IS NOT NULL)::INTEGER = 1
  )
);

CREATE TABLE IF NOT EXISTS public.travel_offer_cost_components (
  component_id TEXT PRIMARY KEY CHECK (char_length(component_id) BETWEEN 1 AND 200),
  search_id TEXT NOT NULL REFERENCES public.travel_searches(search_id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES public.travel_offers(offer_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN ('base', 'tax', 'fee', 'baggage', 'seat', 'resort_fee', 'service', 'discount', 'other')
  ),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  amount NUMERIC(20, 6) NOT NULL,
  currency TEXT NOT NULL CHECK (char_length(currency) BETWEEN 3 AND 8),
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 16384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_evidence (
  evidence_id TEXT PRIMARY KEY CHECK (char_length(evidence_id) BETWEEN 1 AND 200),
  search_id TEXT NOT NULL REFERENCES public.travel_searches(search_id) ON DELETE CASCADE,
  offer_id TEXT REFERENCES public.travel_offers(offer_id) ON DELETE CASCADE,
  provider_attempt_id TEXT REFERENCES public.travel_provider_attempts(attempt_id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence_kind TEXT NOT NULL CHECK (
    evidence_kind IN ('provider_response', 'browser_observation', 'revalidation', 'manifest', 'other')
  ),
  manifest_id TEXT,
  artifact_hash TEXT CHECK (artifact_hash IS NULL OR artifact_hash ~ '^[0-9a-f]{64}$'),
  observed_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    octet_length(payload::text) <= 65536
    AND NOT (payload ?| ARRAY[
      'access_token', 'api_key', 'authorization', 'cookie', 'cookies', 'html',
      'raw_body', 'raw_payload', 'raw_request', 'raw_response',
      'request_headers', 'response_body', 'response_headers', 'secret', 'token'
    ])
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_revalidations (
  revalidation_id TEXT PRIMARY KEY CHECK (char_length(revalidation_id) BETWEEN 1 AND 200),
  search_id TEXT NOT NULL REFERENCES public.travel_searches(search_id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES public.travel_offers(offer_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'fresh', 'changed', 'unavailable', 'failed', 'timeout', 'expired')
  ),
  requested_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  currency TEXT CHECK (currency IS NULL OR char_length(currency) BETWEEN 3 AND 8),
  total_amount NUMERIC(20, 6) CHECK (total_amount IS NULL OR total_amount >= 0),
  available BOOLEAN,
  expires_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    octet_length(payload::text) <= 32768
    AND NOT (payload ?| ARRAY[
      'access_token', 'api_key', 'authorization', 'cookie', 'cookies', 'html',
      'raw_body', 'raw_payload', 'raw_request', 'raw_response',
      'request_headers', 'response_body', 'response_headers', 'secret', 'token'
    ])
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_redirect_events (
  redirect_id TEXT PRIMARY KEY CHECK (char_length(redirect_id) BETWEEN 1 AND 200),
  search_id TEXT NOT NULL REFERENCES public.travel_searches(search_id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES public.travel_offers(offer_id) ON DELETE CASCADE,
  revalidation_id TEXT NOT NULL REFERENCES public.travel_revalidations(revalidation_id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_hash TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('authorized', 'opened', 'consumed', 'rejected', 'expired', 'failed')
  ),
  authorized_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  supplier_id TEXT CHECK (supplier_id IS NULL OR char_length(supplier_id) <= 200),
  target_origin TEXT CHECK (target_origin IS NULL OR char_length(target_origin) <= 300),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    octet_length(payload::text) <= 16384
    AND NOT (payload ?| ARRAY['authorization', 'capability_token', 'token', 'url'])
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT travel_redirect_authorization_hash_check CHECK (
    authorization_hash IS NULL OR authorization_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE IF NOT EXISTS public.travel_feedback (
  feedback_id TEXT PRIMARY KEY CHECK (char_length(feedback_id) BETWEEN 1 AND 200),
  search_id TEXT NOT NULL REFERENCES public.travel_searches(search_id) ON DELETE CASCADE,
  offer_id TEXT REFERENCES public.travel_offers(offer_id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (
    feedback_type IN ('helpful', 'not_helpful', 'mismatch', 'stale', 'redirect_failed', 'other')
  ),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 16384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) <= 32768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_searches_user_created
  ON public.travel_searches(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_searches_capability
  ON public.travel_searches(capability_hash) WHERE capability_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_searches_fingerprint_fresh
  ON public.travel_searches(fingerprint, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_provider_attempts_search_created
  ON public.travel_provider_attempts(search_id, created_at);
CREATE INDEX IF NOT EXISTS idx_travel_provider_attempts_provider_status
  ON public.travel_provider_attempts(provider, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_flight_itineraries_market
  ON public.travel_flight_itineraries(origin, destination, departure_date);
CREATE INDEX IF NOT EXISTS idx_travel_hotel_properties_market
  ON public.travel_hotel_properties(country_code, city_code, name);
CREATE INDEX IF NOT EXISTS idx_travel_hotel_crosswalk_property
  ON public.travel_hotel_property_crosswalks(property_id, provider);
CREATE INDEX IF NOT EXISTS idx_travel_offers_search_total
  ON public.travel_offers(search_id, currency, total_amount, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_offers_itinerary
  ON public.travel_offers(itinerary_id, observed_at DESC) WHERE itinerary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_offers_property
  ON public.travel_offers(hotel_property_id, observed_at DESC) WHERE hotel_property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_cost_components_offer
  ON public.travel_offer_cost_components(offer_id, mandatory, kind);
CREATE INDEX IF NOT EXISTS idx_travel_evidence_search_offer
  ON public.travel_evidence(search_id, offer_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_revalidations_offer_requested
  ON public.travel_revalidations(offer_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_redirect_authorization_unique
  ON public.travel_redirect_events(authorization_hash) WHERE authorization_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_redirect_search_created
  ON public.travel_redirect_events(search_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_feedback_search_created
  ON public.travel_feedback(search_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_travel_searches_updated_at ON public.travel_searches;
CREATE TRIGGER trg_travel_searches_updated_at
  BEFORE UPDATE ON public.travel_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_travel_flight_itineraries_updated_at ON public.travel_flight_itineraries;
CREATE TRIGGER trg_travel_flight_itineraries_updated_at
  BEFORE UPDATE ON public.travel_flight_itineraries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_travel_hotel_properties_updated_at ON public.travel_hotel_properties;
CREATE TRIGGER trg_travel_hotel_properties_updated_at
  BEFORE UPDATE ON public.travel_hotel_properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_travel_offers_updated_at ON public.travel_offers;
CREATE TRIGGER trg_travel_offers_updated_at
  BEFORE UPDATE ON public.travel_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_travel_preferences_updated_at ON public.travel_preferences;
CREATE TRIGGER trg_travel_preferences_updated_at
  BEFORE UPDATE ON public.travel_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.travel_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_provider_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_flight_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_hotel_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_hotel_property_crosswalks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_offer_cost_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_revalidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_redirect_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS travel_searches_owner_select ON public.travel_searches;
CREATE POLICY travel_searches_owner_select ON public.travel_searches
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_provider_attempts_owner_select ON public.travel_provider_attempts;
CREATE POLICY travel_provider_attempts_owner_select ON public.travel_provider_attempts
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_offers_owner_select ON public.travel_offers;
CREATE POLICY travel_offers_owner_select ON public.travel_offers
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_cost_components_owner_select ON public.travel_offer_cost_components;
CREATE POLICY travel_cost_components_owner_select ON public.travel_offer_cost_components
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_evidence_owner_select ON public.travel_evidence;
CREATE POLICY travel_evidence_owner_select ON public.travel_evidence
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_revalidations_owner_select ON public.travel_revalidations;
CREATE POLICY travel_revalidations_owner_select ON public.travel_revalidations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_redirect_events_owner_select ON public.travel_redirect_events;
CREATE POLICY travel_redirect_events_owner_select ON public.travel_redirect_events
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_feedback_owner_select ON public.travel_feedback;
CREATE POLICY travel_feedback_owner_select ON public.travel_feedback
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS travel_preferences_owner_all ON public.travel_preferences;
CREATE POLICY travel_preferences_owner_all ON public.travel_preferences
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.travel_searches FROM anon;
REVOKE ALL ON TABLE public.travel_provider_attempts FROM anon;
REVOKE ALL ON TABLE public.travel_flight_itineraries FROM anon;
REVOKE ALL ON TABLE public.travel_hotel_properties FROM anon;
REVOKE ALL ON TABLE public.travel_hotel_property_crosswalks FROM anon;
REVOKE ALL ON TABLE public.travel_offers FROM anon;
REVOKE ALL ON TABLE public.travel_offer_cost_components FROM anon;
REVOKE ALL ON TABLE public.travel_evidence FROM anon;
REVOKE ALL ON TABLE public.travel_revalidations FROM anon;
REVOKE ALL ON TABLE public.travel_redirect_events FROM anon;
REVOKE ALL ON TABLE public.travel_feedback FROM anon;
REVOKE ALL ON TABLE public.travel_preferences FROM anon;

GRANT SELECT ON TABLE public.travel_searches TO authenticated;
GRANT SELECT ON TABLE public.travel_provider_attempts TO authenticated;
GRANT SELECT ON TABLE public.travel_offers TO authenticated;
GRANT SELECT ON TABLE public.travel_offer_cost_components TO authenticated;
GRANT SELECT ON TABLE public.travel_evidence TO authenticated;
GRANT SELECT ON TABLE public.travel_revalidations TO authenticated;
GRANT SELECT ON TABLE public.travel_redirect_events TO authenticated;
GRANT SELECT ON TABLE public.travel_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.travel_preferences TO authenticated;

GRANT ALL ON TABLE public.travel_searches TO service_role;
GRANT ALL ON TABLE public.travel_provider_attempts TO service_role;
GRANT ALL ON TABLE public.travel_flight_itineraries TO service_role;
GRANT ALL ON TABLE public.travel_hotel_properties TO service_role;
GRANT ALL ON TABLE public.travel_hotel_property_crosswalks TO service_role;
GRANT ALL ON TABLE public.travel_offers TO service_role;
GRANT ALL ON TABLE public.travel_offer_cost_components TO service_role;
GRANT ALL ON TABLE public.travel_evidence TO service_role;
GRANT ALL ON TABLE public.travel_revalidations TO service_role;
GRANT ALL ON TABLE public.travel_redirect_events TO service_role;
GRANT ALL ON TABLE public.travel_feedback TO service_role;
GRANT ALL ON TABLE public.travel_preferences TO service_role;

COMMIT;
