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
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, Field, field_validator

SCHEMA_VERSION = "0.1.0"

# Offers older than this are stale for price purposes (PDR FR-8).
OFFER_TTL_SECONDS = 900


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
    exact = "exact"                    # eligible for the "Save AED X" headline
    exact_tradeoff = "exact_tradeoff"  # same product, material disclosed difference
    similar = "similar"                # e.g. refurbished same model
    mismatch = "mismatch"              # rejected — never recommended


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
    other: Dict[str, Any] = Field(default_factory=dict)


class IdentityEvidence(BaseModel):
    field: str                  # e.g. "model", "gtin", "storage"
    value: str
    source: str = "title"       # json_ld | meta | title | adapter | fixture
    confidence: float = 0.0


class ProductIdentity(BaseModel):
    canonical_id: Optional[str] = None
    category: str = "electronics"
    brand: Optional[str] = None
    family: Optional[str] = None
    model: Optional[str] = None                  # normalized model number
    mpn: Optional[str] = None
    gtins: List[str] = Field(default_factory=list)
    variant: Variant = Field(default_factory=Variant)
    identity_confidence: float = 0.0
    evidence: List[IdentityEvidence] = Field(default_factory=list)


class Seller(BaseModel):
    name: Optional[str] = None
    type: SellerType = SellerType.unknown
    trust_score: Optional[float] = None


class PriceBreakdown(BaseModel):
    """All-in payable components. None means UNKNOWN, never zero (PDR FR-7)."""
    item: Money
    shipping: Optional[Money] = None
    taxes: Optional[Money] = None
    duties: Optional[Money] = None
    mandatory_fees: List[Money] = Field(default_factory=list)
    verified_discount: Optional[Money] = None
    payable_total: Optional[Money] = None   # known-components subtotal (total_cost.py)
    total_complete: bool = False            # True only when no material component unknown
    unknown_components: List[str] = Field(default_factory=list)


class OfferObservation(BaseModel):
    observation_id: str = Field(default_factory=lambda: f"off_{uuid.uuid4().hex[:12]}")
    merchant_id: str = "unknown"
    merchant_name: str = ""
    source_url: str = ""
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    product: ProductIdentity = Field(default_factory=ProductIdentity)
    seller: Seller = Field(default_factory=Seller)
    price: PriceBreakdown
    condition: Condition = Condition.unknown
    stock: StockStatus = StockStatus.unknown
    delivery: Dict[str, Any] = Field(default_factory=dict)   # {"estimate": "1-2 days", "free": true}
    warranty: Dict[str, Any] = Field(default_factory=dict)   # {"region": "UAE", "duration": "1 year"}
    return_terms: Dict[str, Any] = Field(default_factory=dict)
    extraction_confidence: float = 0.0
    evidence_ref: Optional[str] = None
    fixture: bool = False


class EquivalenceResult(BaseModel):
    classification: EquivalenceClass
    score: float = 0.0
    matched_dimensions: List[str] = Field(default_factory=list)
    mismatched_dimensions: List[str] = Field(default_factory=list)
    unknown_dimensions: List[str] = Field(default_factory=list)
    reason_codes: List[ReasonCode] = Field(default_factory=list)
    explanation: str = ""


class CandidateResult(BaseModel):
    offer: OfferObservation
    equivalence: EquivalenceResult
    eligible: bool = False
    rank: Optional[int] = None
    exclusion_reasons: List[ReasonCode] = Field(default_factory=list)


class Savings(BaseModel):
    amount: Optional[Money] = None
    percent: Optional[float] = None


class Recommendation(BaseModel):
    status: ComparisonStatus
    headline: str = ""
    explanation: str = ""
    action_url: Optional[str] = None


class ProviderError(BaseModel):
    merchant_id: str
    error: str


# ── Request / result ─────────────────────────────────────────────────────────

class CurrentOfferInput(BaseModel):
    """Structured fields the extension extracted from the active page.
    Send fields, not the page (PDR FR-2)."""
    title: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    mpn: Optional[str] = None
    gtin: Optional[str] = None
    sku: Optional[str] = None
    price: Money
    shipping: Optional[Money] = None
    seller: Optional[str] = None
    condition: Condition = Condition.new
    stock: StockStatus = StockStatus.unknown
    warranty_text: Optional[str] = None
    delivery_text: Optional[str] = None


class ComparisonRequest(BaseModel):
    source_url: str = ""
    market: str = "AE"
    current_offer: CurrentOfferInput
    page_evidence: Dict[str, Any] = Field(default_factory=dict)  # json_ld, sources, extracted_at


class OptimizationResult(BaseModel):
    comparison_id: str = Field(default_factory=lambda: f"cmp_{uuid.uuid4().hex[:12]}")
    schema_version: str = SCHEMA_VERSION
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    market: str = "AE"
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
    ttl_seconds: int = OFFER_TTL_SECONDS
    fixture_mode: bool = False
