"""Jacobi Compare — core contract schemas (ProductIdentity / OfferObservation /
OptimizationResult).

Separate from agentcore.schemas on purpose: the legacy agent contract
(SCHEMA_VERSION 1.0.0, float Money) stays frozen for backward compatibility;
comparison money is Decimal-safe from day one. pydantic + stdlib only.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
import json
from typing import Any, Dict, List, Literal, Optional
import uuid

from pydantic import BaseModel, Field, field_validator, model_validator

SCHEMA_VERSION = "0.1.0"

# Offers older than this are stale for price purposes (PDR FR-8).
OFFER_TTL_SECONDS = 900


def validate_bounded_json(
    value: Dict[str, Any],
    *,
    max_bytes: int = 131_072,
    max_nodes: int = 2_000,
    max_depth: int = 12,
) -> Dict[str, Any]:
    """Bound untrusted structured metadata without accepting raw page bodies."""
    try:
        encoded = json.dumps(value, ensure_ascii=False, default=str).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError("structured metadata must be JSON-compatible") from exc
    if len(encoded) > max_bytes:
        raise ValueError(f"structured metadata exceeds {max_bytes} bytes")
    stack = [(value, 0)]
    visited = 0
    while stack:
        current, depth = stack.pop()
        visited += 1
        if visited > max_nodes:
            raise ValueError("structured metadata contains too many nodes")
        if depth > max_depth:
            raise ValueError("structured metadata is nested too deeply")
        if isinstance(current, dict):
            for key, item in current.items():
                if str(key).lower() in {"html", "raw_html", "document_html"}:
                    raise ValueError("raw page HTML is not accepted")
                stack.append((item, depth + 1))
        elif isinstance(current, list):
            stack.extend((item, depth + 1) for item in current)
        elif isinstance(current, str) and len(current) > 16_384:
            raise ValueError("structured metadata strings are too large")
    return value


# ── Enums ────────────────────────────────────────────────────────────────────

class Condition(str, Enum):
    new = "new"
    refurbished = "refurbished"
    used = "used"
    open_box = "open_box"
    unknown = "unknown"


class StockStatus(str, Enum):
    in_stock = "in_stock"
    out_of_stock = "out_of_stock"
    preorder = "preorder"
    unknown = "unknown"


class SellerType(str, Enum):
    first_party = "first_party"
    marketplace = "marketplace"
    official_store = "official_store"
    unknown = "unknown"


class EquivalenceClass(str, Enum):
    exact = "EXACT_EQUIVALENT"
    exact_tradeoff = "EQUIVALENT_WITH_DISCLOSED_TRADEOFF"
    similar = "SIMILAR_NOT_EQUIVALENT"
    mismatch = "REJECTED"


class ComparisonStatus(str, Enum):
    save = "save"
    already_best = "already_best"
    tradeoff = "tradeoff"
    insufficient_evidence = "insufficient_evidence"
    unsupported = "unsupported"
    error_partial = "error_partial"


class Confidence(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class PreferenceMode(str, Enum):
    """How valid offers are ordered after mandatory safety filters."""

    balanced = "balanced"
    lowest_complete_price = "lowest_complete_price"
    official_seller = "official_seller"
    uae_local_warranty = "uae_local_warranty"


class RouteLegality(str, Enum):
    allowed = "allowed"
    blocked = "blocked"
    unknown = "unknown"


class RevalidationStatus(str, Enum):
    fresh = "fresh"
    needs_revalidation = "needs_revalidation"
    not_supported = "not_supported"


class FeedbackEvent(str, Enum):
    alternative_opened = "alternative_opened"
    false_match_report = "false_match_report"
    wrong_match_feedback = "wrong_match_feedback"


class CostState(str, Enum):
    known = "known"
    estimated = "estimated"
    unknown = "unknown"
    not_applicable = "not_applicable"


class ReasonCode(str, Enum):
    PRODUCT_IDENTITY_EXACT = "PRODUCT_IDENTITY_EXACT"
    PRODUCT_IDENTITY_PROBABLE = "PRODUCT_IDENTITY_PROBABLE"
    PRODUCT_IDENTITY_UNRESOLVED = "PRODUCT_IDENTITY_UNRESOLVED"
    LOWER_TOTAL_FOUND = "LOWER_TOTAL_FOUND"
    CURRENT_OFFER_ALREADY_BEST = "CURRENT_OFFER_ALREADY_BEST"
    VARIANT_MISMATCH = "VARIANT_MISMATCH"
    CONDITION_MISMATCH = "CONDITION_MISMATCH"
    WARRANTY_MISMATCH = "WARRANTY_MISMATCH"
    WARRANTY_UNKNOWN = "WARRANTY_UNKNOWN"
    REGION_MISMATCH = "REGION_MISMATCH"
    GENERATION_MISMATCH = "GENERATION_MISMATCH"
    PROCESSOR_MISMATCH = "PROCESSOR_MISMATCH"
    SIZE_MISMATCH = "SIZE_MISMATCH"
    BUNDLE_MISMATCH = "BUNDLE_MISMATCH"
    ACCESSORY_ONLY = "ACCESSORY_ONLY"
    SELLER_RISK = "SELLER_RISK"
    SHIPPING_UNKNOWN = "SHIPPING_UNKNOWN"
    TAX_UNKNOWN = "TAX_UNKNOWN"
    DUTY_UNKNOWN = "DUTY_UNKNOWN"
    CURRENCY_UNSUPPORTED = "CURRENCY_UNSUPPORTED"
    COUPON_UNVERIFIED = "COUPON_UNVERIFIED"
    CASHBACK_CONDITIONAL = "CASHBACK_CONDITIONAL"
    OFFER_STALE = "OFFER_STALE"
    STOCK_UNCONFIRMED = "STOCK_UNCONFIRMED"
    OUT_OF_STOCK = "OUT_OF_STOCK"
    ROUTE_NOT_LEGAL = "ROUTE_NOT_LEGAL"
    USER_NOT_ELIGIBLE = "USER_NOT_ELIGIBLE"
    SELLER_LEGITIMACY_LOW = "SELLER_LEGITIMACY_LOW"
    EXACT_MATCH_INSUFFICIENT = "EXACT_MATCH_INSUFFICIENT"
    OFFICIAL_ROUTE_FOUND = "OFFICIAL_ROUTE_FOUND"
    PROVIDER_PARTIAL_FAILURE = "PROVIDER_PARTIAL_FAILURE"
    DEEP_AUDIT_AVAILABLE = "DEEP_AUDIT_AVAILABLE"


# ── Value objects ────────────────────────────────────────────────────────────

class Money(BaseModel):
    """Decimal-safe money. Serializes amount as a JSON string ("1499.00")."""
    amount: Decimal
    currency: str = "AED"
    label: Optional[str] = None

    @field_validator("amount", mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> Decimal:
        # Accept int/str/Decimal; accept float only by string round-trip so
        # 1699.99 never becomes 1699.9899999...
        if isinstance(v, float):
            return Decimal(str(v))
        return Decimal(v) if not isinstance(v, Decimal) else v

    def quantized(self) -> Decimal:
        return self.amount.quantize(Decimal("0.01"))


class Variant(BaseModel):
    storage: Optional[str] = None       # normalized, e.g. "256GB", "1TB"
    memory: Optional[str] = None        # RAM, e.g. "8GB"
    colour: Optional[str] = None        # lowercased, e.g. "black"
    size: Optional[str] = None          # e.g. screen size "13in"
    connectivity: Optional[str] = None  # e.g. "wifi", "5g", "wifi+cellular"
    region: Optional[str] = None        # e.g. "uae", "international", "us"
    generation: Optional[str] = None
    processor: Optional[str] = None
    screen_size: Optional[str] = None
    year: Optional[int] = None
    bundle: List[str] = Field(default_factory=list)
    accessories: List[str] = Field(default_factory=list)
    warranty_region: Optional[str] = None
    other: Dict[str, Any] = Field(default_factory=dict)


class IdentityEvidence(BaseModel):
    field: str                  # e.g. "model", "gtin", "storage"
    value: str
    source: str = "title"       # json_ld | meta | title | adapter | fixture
    confidence: float = 0.0
    raw_value: Optional[str] = None
    source_url: Optional[str] = None


class IdentityContradiction(BaseModel):
    field: str
    values: List[str]
    sources: List[str] = Field(default_factory=list)
    explanation: str


class ProductIdentity(BaseModel):
    canonical_id: Optional[str] = None
    category: str = "electronics"
    brand: Optional[str] = None
    family: Optional[str] = None
    model: Optional[str] = None                  # normalized model number
    mpn: Optional[str] = None
    gtins: List[str] = Field(default_factory=list)
    sku: Optional[str] = None
    merchant_skus: Dict[str, str] = Field(default_factory=dict)
    variant: Variant = Field(default_factory=Variant)
    identity_confidence: float = 0.0
    confidence_by_field: Dict[str, float] = Field(default_factory=dict)
    evidence: List[IdentityEvidence] = Field(default_factory=list)
    contradictions: List[IdentityContradiction] = Field(default_factory=list)
    aliases: Dict[str, List[str]] = Field(default_factory=dict)
    unknown_fields: List[str] = Field(default_factory=list)


class Seller(BaseModel):
    name: Optional[str] = None
    type: SellerType = SellerType.unknown
    trust_score: Optional[float] = None
    legitimate: Optional[bool] = None


class CostLine(BaseModel):
    """One explicit cost or discount with uncertainty and eligibility preserved."""

    kind: str
    state: CostState
    amount: Optional[Money] = None
    label: Optional[str] = None
    eligibility: Optional[str] = None
    user_eligible: Optional[bool] = None
    assumptions: List[str] = Field(default_factory=list)
    confidence: Optional[float] = None

    @model_validator(mode="after")
    def _state_matches_amount(self) -> "CostLine":
        if self.state in (CostState.known, CostState.estimated) and self.amount is None:
            raise ValueError("known or estimated cost lines require an amount")
        if self.state in (CostState.unknown, CostState.not_applicable) and self.amount is not None:
            raise ValueError("unknown or not-applicable cost lines cannot carry an amount")
        return self


class PriceBreakdown(BaseModel):
    """All-in components with explicit state; unknown never means zero."""

    item: Money
    shipping: Optional[Money] = None
    shipping_state: Optional[CostState] = None
    taxes: Optional[Money] = None
    taxes_state: Optional[CostState] = None
    duties: Optional[Money] = None
    duties_state: Optional[CostState] = None
    mandatory_fees: List[Money] = Field(default_factory=list)
    marketplace_fees: List[CostLine] = Field(default_factory=list)
    payment_fees: List[CostLine] = Field(default_factory=list)
    fx_adjustments: List[CostLine] = Field(default_factory=list)
    coupons: List[CostLine] = Field(default_factory=list)
    membership_discounts: List[CostLine] = Field(default_factory=list)
    student_discounts: List[CostLine] = Field(default_factory=list)
    cashback: List[CostLine] = Field(default_factory=list)
    mandatory_service_costs: List[CostLine] = Field(default_factory=list)
    verified_discount: Optional[Money] = None
    payable_total: Optional[Money] = None
    total_complete: bool = False
    unknown_components: List[str] = Field(default_factory=list)
    estimated_components: List[str] = Field(default_factory=list)
    conditional_savings: List[CostLine] = Field(default_factory=list)

    @model_validator(mode="after")
    def _infer_legacy_states(self) -> "PriceBreakdown":
        if self.shipping_state is None:
            self.shipping_state = CostState.known if self.shipping is not None else CostState.unknown
        if self.taxes_state is None:
            self.taxes_state = CostState.known if self.taxes is not None else CostState.not_applicable
        if self.duties_state is None:
            self.duties_state = CostState.known if self.duties is not None else CostState.not_applicable
        return self


class OfferObservation(BaseModel):
    observation_id: str = Field(default_factory=lambda: f"off_{uuid.uuid4().hex[:12]}")
    merchant_id: str = "unknown"
    merchant_name: str = ""
    source_url: str = ""
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    stock_observed_at: Optional[datetime] = None
    ttl_seconds: int = Field(default=OFFER_TTL_SECONDS, ge=30, le=86_400)
    revalidation_status: RevalidationStatus = RevalidationStatus.fresh
    product: ProductIdentity = Field(default_factory=ProductIdentity)
    seller: Seller = Field(default_factory=Seller)
    price: PriceBreakdown
    condition: Condition = Condition.unknown
    stock: StockStatus = StockStatus.unknown
    delivery: Dict[str, Any] = Field(default_factory=dict)   # {"estimate": "1-2 days", "free": true}
    warranty: Dict[str, Any] = Field(default_factory=dict)   # {"region": "UAE", "duration": "1 year"}
    return_terms: Dict[str, Any] = Field(default_factory=dict)
    extraction_confidence: float = 0.0
    evidence_tier: Optional[str] = None
    evidence_ref: Optional[str] = None
    user_eligible: Optional[bool] = None
    route_legality: RouteLegality = RouteLegality.unknown
    fixture: bool = False


class EquivalenceResult(BaseModel):
    classification: EquivalenceClass
    score: float = 0.0
    matched_dimensions: List[str] = Field(default_factory=list)
    mismatched_dimensions: List[str] = Field(default_factory=list)
    unknown_dimensions: List[str] = Field(default_factory=list)
    field_explanations: Dict[str, str] = Field(default_factory=dict)
    reason_codes: List[ReasonCode] = Field(default_factory=list)
    explanation: str = ""


class CandidateResult(BaseModel):
    offer: OfferObservation
    equivalence: EquivalenceResult
    eligible: bool = False
    rank: Optional[int] = None
    exclusion_reasons: List[ReasonCode] = Field(default_factory=list)
    exclusion_explanations: List[str] = Field(default_factory=list)
    ranking_factors: Dict[str, Any] = Field(default_factory=dict)
    selection_explanation: str = ""


class Savings(BaseModel):
    amount: Optional[Money] = None
    percent: Optional[float] = None


class Recommendation(BaseModel):
    status: ComparisonStatus
    headline: str = ""
    explanation: str = ""
    action_url: Optional[str] = None


class OptimizationEnvelope(BaseModel):
    """DecisionEnvelope-compatible summary tied to immutable optimization evidence."""

    envelope_id: str = Field(default_factory=lambda: f"opt_{uuid.uuid4().hex[:16]}")
    comparison_id: str
    decision: ComparisonStatus
    recommendation: Recommendation
    savings: Savings = Field(default_factory=Savings)
    selected_offer_id: Optional[str] = None
    excluded_offer_ids: List[str] = Field(default_factory=list)
    confidence: Confidence
    reason_codes: List[ReasonCode] = Field(default_factory=list)
    evidence_manifest_id: str
    immutable_evidence: bool = True


class ProviderError(BaseModel):
    merchant_id: str
    error: str
    code: str = "PROVIDER_FAILED"
    retryable: bool = False


# ── Request / result ─────────────────────────────────────────────────────────

class CurrentOfferInput(BaseModel):
    """Structured fields the extension extracted from the active page.
    Send fields, not the page (PDR FR-2)."""
    title: Optional[str] = Field(default=None, max_length=1_000)
    brand: Optional[str] = Field(default=None, max_length=200)
    model: Optional[str] = Field(default=None, max_length=200)
    mpn: Optional[str] = Field(default=None, max_length=200)
    gtin: Optional[str] = Field(default=None, max_length=64)
    sku: Optional[str] = Field(default=None, max_length=200)
    family: Optional[str] = Field(default=None, max_length=200)
    storage: Optional[str] = Field(default=None, max_length=100)
    memory: Optional[str] = Field(default=None, max_length=100)
    generation: Optional[str] = None
    processor: Optional[str] = None
    screen_size: Optional[str] = None
    year: Optional[int] = None
    region: Optional[str] = None
    colour: Optional[str] = None
    connectivity: Optional[str] = None
    bundle: List[str] = Field(default_factory=list)
    accessories: List[str] = Field(default_factory=list)
    warranty_region: Optional[str] = None
    price: Money
    shipping: Optional[Money] = None
    seller: Optional[str] = None
    seller_type: SellerType = SellerType.unknown
    seller_trust_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    seller_legitimate: Optional[bool] = None
    user_eligible: Optional[bool] = None
    route_legality: RouteLegality = RouteLegality.unknown
    condition: Condition = Condition.new
    stock: StockStatus = StockStatus.unknown
    warranty_text: Optional[str] = None
    delivery_text: Optional[str] = None


class SubmittedOfferInput(BaseModel):
    """A real offer observed in a user-opened browser tab."""

    source_url: str = Field(max_length=2_048)
    merchant_id: Optional[str] = None
    merchant_name: Optional[str] = None
    current_offer: CurrentOfferInput
    page_evidence: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_url")
    @classmethod
    def _http_source_url(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.lower().startswith(("http://", "https://")):
            raise ValueError("source_url must be absolute http(s)")
        return normalized

    @field_validator("page_evidence")
    @classmethod
    def _bounded_page_evidence(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        return validate_bounded_json(value)


class ComparisonRequest(BaseModel):
    source_url: str = Field(max_length=2_048)
    market: str = "AE"
    current_offer: CurrentOfferInput
    page_evidence: Dict[str, Any] = Field(default_factory=dict)  # json_ld, sources, extracted_at
    submitted_offers: List[SubmittedOfferInput] = Field(default_factory=list, max_length=20)
    comparison_urls: List[str] = Field(default_factory=list, max_length=20)
    include_fixture_offers: bool = False
    allow_direct_http: bool = False
    preference_mode: PreferenceMode = PreferenceMode.balanced
    overall_timeout_seconds: float = Field(default=15.0, ge=1.0, le=30.0)
    max_concurrency: int = Field(default=5, ge=1, le=10)

    @field_validator("source_url")
    @classmethod
    def _source_is_http(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.lower().startswith(("http://", "https://")):
            raise ValueError("source_url must be absolute http(s)")
        return normalized

    @field_validator("page_evidence")
    @classmethod
    def _bounded_page_evidence(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        return validate_bounded_json(value)

    @model_validator(mode="after")
    def _direct_http_is_explicit(self) -> "ComparisonRequest":
        if self.comparison_urls and not self.allow_direct_http:
            raise ValueError("comparison_urls require allow_direct_http=true")
        return self


class OptimizationResult(BaseModel):
    comparison_id: str = Field(default_factory=lambda: f"cmp_{uuid.uuid4().hex[:12]}")
    schema_version: str = SCHEMA_VERSION
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    market: str = "AE"
    preference_mode: PreferenceMode = PreferenceMode.balanced
    product: ProductIdentity = Field(default_factory=ProductIdentity)
    current_offer: Optional[OfferObservation] = None
    best_offer: Optional[OfferObservation] = None
    eligible_offers: List[CandidateResult] = Field(default_factory=list)
    tradeoff_offers: List[CandidateResult] = Field(default_factory=list)
    similar_offers: List[CandidateResult] = Field(default_factory=list)
    rejected_offers: List[CandidateResult] = Field(default_factory=list)
    savings: Savings = Field(default_factory=Savings)
    recommendation: Recommendation = Field(
        default_factory=lambda: Recommendation(status=ComparisonStatus.insufficient_evidence)
    )
    confidence: Confidence = Confidence.low
    reason_codes: List[ReasonCode] = Field(default_factory=list)
    provider_errors: List[ProviderError] = Field(default_factory=list)
    evidence_manifest_id: Optional[str] = None
    optimization_envelope: Optional[OptimizationEnvelope] = None
    comparison_access_token: Optional[str] = None
    ttl_seconds: int = OFFER_TTL_SECONDS
    fixture_mode: bool = False


class IdentifyProductRequest(BaseModel):
    fields: Dict[str, Any]

    @field_validator("fields")
    @classmethod
    def _bounded_fields(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        return validate_bounded_json(value, max_bytes=65_536, max_nodes=500)


class DiscoveryResult(BaseModel):
    comparison_id: str
    comparison_access_token: Optional[str] = None
    product: ProductIdentity
    offers: List[OfferObservation] = Field(default_factory=list)
    provider_errors: List[ProviderError] = Field(default_factory=list)
    evidence_manifest_id: Optional[str] = None
    fixture_mode: bool = False


class ComparisonStatusResult(BaseModel):
    comparison_id: str
    status: ComparisonStatus
    created_at: datetime
    provider_errors: List[ProviderError] = Field(default_factory=list)
    complete: bool = True


class ProviderDescriptorResult(BaseModel):
    provider_id: str
    name: str
    merchant_id: Optional[str] = None
    merchant_name: Optional[str] = None
    kind: str
    domains: List[str] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)
    cost: str
    cost_estimate_usd: float = 0.0
    evidence_tier: str
    timeout_seconds: float
    retries: int
    limitations: List[str] = Field(default_factory=list)
    rate_limit: Dict[str, Any] = Field(default_factory=dict)
    health: str
    extraction_fields: List[str] = Field(default_factory=list)
    explicit_invocation_required: bool
    fixture: bool


class ProviderCapabilitiesResult(BaseModel):
    providers: List[ProviderDescriptorResult]
    default_paid_provider_count: int = 0


class ProviderHealthItem(BaseModel):
    provider_id: str
    health: str
    fixture: bool
    cost: str


class ProviderHealthResult(BaseModel):
    providers: List[ProviderHealthItem]


class DeepAuditRequest(BaseModel):
    explicit: bool = False
    demo: Optional[str] = None
    url: Optional[str] = Field(default=None, max_length=2_048)
    displayed_total_amount: Optional[float] = Field(default=None, ge=0)
    displayed_total_currency: str = Field(default="AED", min_length=3, max_length=3)
    consent_scope: str = "research_only"
    tier: str = "free"
    allow_managed_provider: bool = False

    @model_validator(mode="after")
    def _has_target(self) -> "DeepAuditRequest":
        if not self.demo and not self.url:
            raise ValueError("demo or url is required")
        return self


class DeepAuditResult(BaseModel):
    status: str
    automatic_paid_provider_calls: bool = False
    managed_provider_explicitly_allowed: bool = False
    paid_provider_usage: Literal["not_performed", "performed", "unknown"] = (
        "not_performed"
    )
    result: Dict[str, Any] = Field(default_factory=dict)


class FeedbackRequest(BaseModel):
    comparison_id: str = Field(min_length=5, max_length=100)
    event: FeedbackEvent
    offer_observation_id: Optional[str] = Field(default=None, max_length=100)


class FeedbackResult(BaseModel):
    accepted: bool = True
    event_id: str
