"""
Site-specific price-extractor registry (Stage 2).

The generic price parser in main.py (`parse_page_prices`) stays the default for
everything. This package adds ISOLATED, site-specific extractors that run FIRST
for the sites they understand (e.g. Booking.com, whose prices live in an
embedded JSON blob the generic parser can't read), and fall back to the generic
parser when they find nothing confident.

Design:
  - `PriceHit` is the structured result: native value + currency, optional USD
    normalization, the raw on-page text, the method/selector used, a confidence
    score, a price_kind (total_stay / per_night / room_rate / unavailable), and
    a flag for unverifiable tax inclusion.
  - `get_extractor(url)` returns a callable `extract(html, url) -> ExtractResult`
    for a supported site, or None.
  - `travel_context(url)` reports whether a travel URL carries the dates /
    occupancy needed for a meaningful price comparison.

Nothing here touches the generic parser, the agent matrix, or the engine's
Stage-1 latency/coverage behaviour.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Callable, List, Optional
from urllib.parse import urlparse, parse_qs


@dataclass
class PriceHit:
    native_price: Optional[float] = None
    native_currency: Optional[str] = None
    normalized_price_usd: Optional[float] = None
    raw_text: Optional[str] = None
    extraction_method: Optional[str] = None
    source: Optional[str] = None            # selector / json key the value came from
    confidence: float = 0.0                 # 0..1
    price_kind: str = "room_rate"           # total_stay | per_night | room_rate | unavailable
    includes_taxes_unknown: bool = True     # True when tax inclusion can't be verified

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ExtractResult:
    """What a site extractor returns. `hits` may be empty (→ caller falls back to
    the generic parser). `context_ok` is False when the URL lacks required travel
    context, in which case `message` explains what's needed."""
    hits: List[PriceHit] = field(default_factory=list)
    context_ok: bool = True
    message: Optional[str] = None
    site: Optional[str] = None


# ── Travel-context detection ────────────────────────────────────────────────
# Booking/travel prices are only comparable with dates + occupancy. We never
# silently invent these for a real user scan.
def travel_context(url: str) -> dict:
    """Parse travel context from a URL. Returns a dict with checkin/checkout/
    adults/rooms/currency and an `ok` boolean (has the minimum: both dates)."""
    try:
        q = parse_qs(urlparse(url or "").query)
    except Exception:
        q = {}

    def g(*keys):
        for k in keys:
            if k in q and q[k] and q[k][0]:
                return q[k][0]
        return None

    checkin = g("checkin", "checkin_year_month_monthday", "ci")
    checkout = g("checkout", "checkout_year_month_monthday", "co")
    adults = g("group_adults", "adults", "no_adults")
    rooms = g("no_rooms", "rooms")
    children = g("group_children", "children")
    currency = g("selected_currency", "currency")
    return {
        "checkin": checkin,
        "checkout": checkout,
        "adults": adults,
        "rooms": rooms,
        "children": children,
        "currency": currency,
        # Minimum bar for a meaningful comparison: both dates present.
        "ok": bool(checkin and checkout),
    }


# Sites whose prices are only comparable WITH travel context (dates +
# occupancy). For these, a dateless URL can never yield a meaningful price, so
# the engine can short-circuit before launching any agents.
_TRAVEL_CONTEXT_SITES = ("booking.com",)


# ── Registry ────────────────────────────────────────────────────────────────
def get_extractor(url: str) -> Optional[Callable[[str, str], "ExtractResult"]]:
    """Return the site-specific extractor for this URL, or None to use the
    generic parser. Kept tiny + explicit so routing is auditable."""
    u = (url or "").lower()
    if "booking.com" in u:
        from .booking import extract_booking
        return extract_booking
    return None


def requires_travel_context(url: str) -> bool:
    """True when this site's prices are only comparable with dates + occupancy
    (e.g. Booking.com). Lets the engine decide up front that a dateless URL
    can't be priced, instead of probing every agent only to reject each fetch."""
    u = (url or "").lower()
    return any(site in u for site in _TRAVEL_CONTEXT_SITES)


def is_supported(url: str) -> bool:
    return get_extractor(url) is not None
