-- ============================================================================
-- Migration 003: Outbox Pattern & Webhook Configuration
-- ============================================================================
-- Implements the Transactional Outbox pattern for reliable webhook delivery.
--   • webhook_configs  – per-user webhook destination configuration
--   • outbox_log       – durable event queue consumed by the dispatcher worker
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. webhook_configs
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_configs (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    destination_url         TEXT            NOT NULL
                                            CONSTRAINT chk_destination_https
                                            CHECK (destination_url ~* '^https://'),
    secret_key              TEXT            NOT NULL,
    target_domains          TEXT[]          NOT NULL DEFAULT '{}',
    price_spread_threshold  INT             NOT NULL DEFAULT 0
                                            CONSTRAINT chk_spread_cents
                                            CHECK (price_spread_threshold >= 0),
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE  webhook_configs                          IS 'Per-user webhook destination definitions.';
COMMENT ON COLUMN webhook_configs.price_spread_threshold   IS 'Minimum price spread (in cents) that triggers a notification.';
COMMENT ON COLUMN webhook_configs.target_domains           IS 'Array of domain names the user is interested in monitoring.';
COMMENT ON COLUMN webhook_configs.secret_key               IS 'HMAC-SHA256 shared secret for request signing.';

-- GIN index for fast array-overlap queries (e.g. target_domains && ARRAY[...])
CREATE INDEX IF NOT EXISTS idx_webhook_configs_target_domains
    ON webhook_configs USING GIN (target_domains);

-- Lookup by user
CREATE INDEX IF NOT EXISTS idx_webhook_configs_user_id
    ON webhook_configs (user_id);

-- --------------------------------------------------------------------------
-- 2. outbox_log
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_log (
    id              BIGSERIAL       PRIMARY KEY,
    aggregate_type  VARCHAR(50)     NOT NULL,
    aggregate_id    VARCHAR(100)    NOT NULL,
    event_type      VARCHAR(100)    NOT NULL,
    payload         JSONB           NOT NULL DEFAULT '{}',
    status          VARCHAR(20)     NOT NULL DEFAULT 'PENDING'
                                    CONSTRAINT chk_outbox_status
                                    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    retry_count     INT             NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE  outbox_log                IS 'Transactional outbox for reliable at-least-once event delivery.';
COMMENT ON COLUMN outbox_log.aggregate_type IS 'Bounded-context aggregate (e.g. "domain_listing", "price_alert").';
COMMENT ON COLUMN outbox_log.aggregate_id   IS 'Identifier of the originating aggregate instance.';
COMMENT ON COLUMN outbox_log.next_retry_at  IS 'Earliest wall-clock time at which a FAILED event may be re-attempted.';

-- Partial index: the worker only ever queries rows that are actionable.
CREATE INDEX IF NOT EXISTS idx_outbox_log_pending_failed
    ON outbox_log (next_retry_at NULLS FIRST, id)
    WHERE status IN ('PENDING', 'FAILED');

-- --------------------------------------------------------------------------
-- 3. Row Level Security – webhook_configs
-- --------------------------------------------------------------------------
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

-- Owners can read their own configs
CREATE POLICY webhook_configs_select_own
    ON webhook_configs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Owners can insert configs for themselves
CREATE POLICY webhook_configs_insert_own
    ON webhook_configs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Owners can update their own configs
CREATE POLICY webhook_configs_update_own
    ON webhook_configs
    FOR UPDATE
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Owners can delete their own configs
CREATE POLICY webhook_configs_delete_own
    ON webhook_configs
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service-role bypass (used by the dispatcher worker)
CREATE POLICY webhook_configs_service_all
    ON webhook_configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4. Auto-update updated_at triggers
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_webhook_configs_updated_at
    BEFORE UPDATE ON webhook_configs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_outbox_log_updated_at
    BEFORE UPDATE ON outbox_log
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMIT;
