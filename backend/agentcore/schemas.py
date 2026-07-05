"""
Jacobi for Agents — core contract schemas.

Source of truth for the agentic price-provenance layer (PRD: "Jacobi for
Agents, Deep Research Edition"). Every API/MCP tool response is built from
these models. Keep this file dependency-light: pydantic + stdlib only.

Canonical hashing contract (used by evidence.py and tests):
  manifest_sha256 = sha256( json.dumps(manifest_dict, sort_keys=True,
      separators=(",", ":"), default=str) ) where manifest_dict is the
  manifest model dump EXCLUDING the fields {"manifest_sha256", "signature"}.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0.0"


# ── Enums ────────────────────────────────────────────────────────────────────

class ConsentScope(str, Enum):
    research_only = "research_only"
    recommend = "recommend"
    checkout_prepare = "checkout_prepare"
    purchase_authorized = "purchase_authorized"


class ActionMode(str, Enum):
    """Policy registry action modes (most→least restrictive is reversed)."""
    evidence_only = "evidence_only"
    recommendation_allowed = "recommendation_allowed"
    checkout_prepare_allowed = "checkout_prepare_allowed"
    purchase_authorized_allowed = "purchase_authorized_allowed"
    blocked = "blocked"


class Decision(str, Enum):
    proceed = "proceed"
    proceed_with_caution = "proceed_with_caution"
    ask_user = "ask_user"
    handoff_to_user = "handoff_to_user"
    use_official_route = "use_official_route"
    block = "block"


class Confidence(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class EvidenceTier(str, Enum):
    claim_only = "claim_only"          # T0 — agent-provided, not observed
    local = "local"                    # T1 — local collection
    managed_request = "managed_request"  # T2
    managed_browser = "managed_browser"  # T3
    official_api = "official_api"      # T4


class RouteType(str, Enum):
    official_api = "official_api"
    acp = "acp"
    merchant_site = "merchant_site"
    partner_api = "partner_api"
    affiliate = "affiliate"
    user_handoff = "user_handoff"
    unknown = "unknown"


class RouteLegality(str, Enum):
    official = "official"
    partner = "partner"
    user_handoff = "user_handoff"
    evidence_only = "evidence_only"
    blocked = "blocked"


class BudgetStatus(str, Enum):
    ok = "ok"
    near_limit = "near_limit"
    blocked = "blocked"


class ReasonCode(str, Enum):
    PRICE_STABLE = "PRICE_STABLE"
    PRICE_STALE = "PRICE_STALE"
    PRICE_DRIFT_MINOR = "PRICE_DRIFT_MINOR"
    PRICE_DRIFT_MAJOR = "PRICE_DRIFT_MAJOR"
    MANDATORY_FEE_LATE = "MANDATORY_FEE_LATE"
    FEE_DISCLOSURE_DRIFT = "FEE_DISCLOSURE_DRIFT"
    CURRENCY_SPREAD_UNCLEAR = "CURRENCY_SPREAD_UNCLEAR"
    INVENTORY_STALE = "INVENTORY_STALE"
    OFFICIAL_ROUTE_FOUND = "OFFICIAL_ROUTE_FOUND"
    PLATFORM_AUTOMATION_RESTRICTED = "PLATFORM_AUTOMATION_RESTRICTED"
    POLICY_FORBIDS_AUTOMATION = "POLICY_FORBIDS_AUTOMATION"
    EVIDENCE_LIMITED_LOCAL_ONLY = "EVIDENCE_LIMITED_LOCAL_ONLY"
    PROVIDER_LIMITATION = "PROVIDER_LIMITATION"
    LOW_EXTRACTOR_CONFIDENCE = "LOW_EXTRACTOR_CONFIDENCE"
    MANIFEST_INCOMPLETE = "MANIFEST_INCOMPLETE"
    BUDGET_BLOCKED = "BUDGET_BLOCKED"


# ── Value objects ────────────────────────────────────────────────────────────

class Money(BaseModel):
    amount: float
    currency: str = "USD"
    label: Optional[str] = None  # e.g. "Tourism Dirham fee"


class ProviderCapabilities(BaseModel):
    provider: str = "unknown"
    http_fetch: bool = False
    js_render: bool = False
    browser_actions: bool = False
    screenshot: bool = False
    html_capture: bool = False
    network_log: bool = False
    trace_zip: bool = False
    cookie_seed: bool = False
    storage_state: bool = False
    locale_emulation: bool = False
    timezone_emulation: bool = False
    geolocation_emulation: bool = False
    real_ip_geolocation: bool = False
    captcha_handling: bool = False
    anti_bot_managed: bool = False
    official_api: bool = False
    commerce_protocol: str = "none"  # none | acp | ap2 | merchant_api | affiliate
    cost_unit: str = "free"


class Artifact(BaseModel):
    kind: str  # html | screenshot | trace | network_summary | json
    sha256: str
    storage_uri: Optional[str] = None
    bytes: Optional[int] = None
    content_type: Optional[str] = None
    fixture: bool = False  # True when artifact comes from a deterministic demo fixture


class Extraction(BaseModel):
    field: str  # e.g. total_price, displayed_price, mandatory_fee, availability
    value: Any
    selector: Optional[str] = None
    method: str = "css"
    confidence: float = 0.0
    extractor_version: str = "v0"


class CollectionAttempt(BaseModel):
    attempt_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    provider: str = "fixture"
    stage: str = "listing"  # listing | checkout_prep | search | api
    url: str = ""
    final_url: str = ""
    http_status: Optional[int] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    capabilities: ProviderCapabilities = Field(default_factory=ProviderCapabilities)
    artifacts: List[Artifact] = Field(default_factory=list)
    extractions: List[Extraction] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    cost_estimate_usd: float = 0.0
    error: Optional[str] = None
    fixture: bool = False


# ── Core objects ─────────────────────────────────────────────────────────────

class PriceObligation(BaseModel):
    """The purchase state the agent believes it can deliver to the user."""
    obligation_id: str = Field(default_factory=lambda: f"obl_{uuid.uuid4().hex[:12]}")
    agent_id: str = "unknown-agent"
    user_consent_scope: ConsentScope = ConsentScope.research_only
    item_or_booking: Dict[str, Any] = Field(default_factory=dict)
    merchant: Dict[str, Any] = Field(default_factory=dict)
    displayed_total_price: Optional[Money] = None
    mandatory_fees: List[Money] = Field(default_factory=list)
    taxes_or_government_charges: List[Money] = Field(default_factory=list)
    delivery_or_fulfillment: Dict[str, Any] = Field(default_factory=dict)
    cancellation_or_return_terms: Dict[str, Any] = Field(default_factory=dict)
    expiry_time: Optional[datetime] = None
    source_url_or_api_route: str = ""
    evidence_floor: EvidenceTier = EvidenceTier.local
    official_route: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RouteCandidate(BaseModel):
    route_type: RouteType = RouteType.unknown
    url: str = ""
    merchant: Optional[str] = None
    legality: RouteLegality = RouteLegality.evidence_only
    confidence: float = 0.0
    notes: Optional[str] = None


class PolicyDecision(BaseModel):
    domain: str
    requested_scope: ConsentScope
    action_mode: ActionMode
    decision: str  # allow | warn | block
    reason_code: Optional[ReasonCode] = None
    reason: str = ""
    official_route: bool = False
    source: str = "jacobi-policy-registry"
    reviewed_at: Optional[str] = None


class ScoreComponents(BaseModel):
    """Each component 0-100. Weights live in scoring.py."""
    source_legitimacy: float = 0.0
    total_price_integrity: float = 0.0
    price_stability: float = 0.0
    inventory_freshness: float = 0.0
    policy_safety: float = 0.0
    evidence_quality: float = 0.0
    user_control: float = 0.0


class CapabilitySummary(BaseModel):
    local_browser: bool = False
    local_http: bool = False
    managed_request: bool = False
    managed_browser: bool = False
    official_api: bool = False
    real_ip_geography: bool = False
    locale_emulation: bool = False
    timezone_emulation: bool = False
    screenshot: bool = False
    trace_zip: bool = False
    network_log: bool = False
    fixture_mode: bool = False


class EvidenceManifest(BaseModel):
    manifest_id: str = Field(default_factory=lambda: f"man_{uuid.uuid4().hex[:12]}")
    version: str = SCHEMA_VERSION
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    target: Dict[str, Any] = Field(default_factory=dict)  # url, final_url, domain, merchant_name
    obligation_id: str = ""
    collection_attempts: List[CollectionAttempt] = Field(default_factory=list)
    capability_summary: CapabilitySummary = Field(default_factory=CapabilitySummary)
    artifacts: List[Artifact] = Field(default_factory=list)
    extractions: List[Extraction] = Field(default_factory=list)
    extractor_version: str = "v0"
    limitations: List[str] = Field(default_factory=list)
    parent_sha256: Optional[str] = None
    manifest_sha256: Optional[str] = None  # set by evidence.build_manifest; excluded from its own hash
    signature: Optional[str] = None        # optional HMAC signature; excluded from hash


class PriceSummary(BaseModel):
    observed_total: Optional[Money] = None
    displayed_total: Optional[Money] = None
    delta_abs: Optional[Money] = None
    delta_pct: Optional[float] = None
    mandatory_fees_detected: List[Money] = Field(default_factory=list)
    currency_notes: List[str] = Field(default_factory=list)
    price_trace: List[Dict[str, Any]] = Field(default_factory=list)  # [{stage, label, amount, currency}]


class RouteSummary(BaseModel):
    source_route: str = ""
    preferred_route: str = ""
    route_legality: RouteLegality = RouteLegality.evidence_only
    candidates: List[RouteCandidate] = Field(default_factory=list)


class EvidenceRef(BaseModel):
    manifest_id: str = ""
    manifest_sha256: str = ""
    capability_tier: EvidenceTier = EvidenceTier.local
    limitations: List[str] = Field(default_factory=list)


class BudgetInfo(BaseModel):
    estimated_cost_usd: float = 0.0
    budget_status: BudgetStatus = BudgetStatus.ok


class DecisionEnvelope(BaseModel):
    request_id: str = Field(default_factory=lambda: f"req_{uuid.uuid4().hex[:12]}")
    schema_version: str = SCHEMA_VERSION
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    obligation_id: str = ""
    decision: Decision = Decision.handoff_to_user
    provenance_score: float = 0.0  # 0-100
    confidence: Confidence = Confidence.low
    score_components: ScoreComponents = Field(default_factory=ScoreComponents)
    reason_codes: List[ReasonCode] = Field(default_factory=list)
    user_explanation: str = ""
    agent_instruction: str = ""
    next_action: str = ""  # short imperative for UIs, e.g. "Confirm the AED 350 fee with the user"
    price_summary: PriceSummary = Field(default_factory=PriceSummary)
    route_summary: RouteSummary = Field(default_factory=RouteSummary)
    policy: Optional[PolicyDecision] = None
    evidence: EvidenceRef = Field(default_factory=EvidenceRef)
    budget: BudgetInfo = Field(default_factory=BudgetInfo)
    ttl_seconds: int = 900  # evidence freshness window — re-verify after this
    fixture_mode: bool = False  # True when the verification ran against demo fixtures
