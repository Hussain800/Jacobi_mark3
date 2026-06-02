"""
Tests for the Booking.com travel extractor (Stage 2).

Fixtures are trimmed real Booking.com pages captured via BrightData from three
proxy regions (IN/AE/GB) plus a no-dates case. They preserve the b_stay_prices
JSON + visible price spans the extractor reads, at ~tens of KB instead of the
~3 MB raw pages. Regenerate with backend/_make_fixtures.py.
"""
from pathlib import Path

import pytest

from extractors import get_extractor, travel_context
import main as M

FIX = Path(__file__).parent / "fixtures"

HOTEL = "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html"
CTX = "?checkin=2026-08-10&checkout=2026-08-14&group_adults=2&no_rooms=1&group_children=0"


def _load(name):
    p = FIX / f"{name}.html"
    if not p.exists():
        pytest.skip(f"fixture {name}.html missing (run _make_fixtures.py)")
    return p.read_text(encoding="utf-8")


# ── Registry routing ────────────────────────────────────────────────────────
def test_registry_routes_booking_and_falls_back():
    assert get_extractor("https://www.booking.com/hotel/in/x.html") is not None
    assert get_extractor("https://www.amazon.ae/dp/B0FL4HLJ56/") is None
    assert get_extractor("") is None


# ── Travel-context detection ────────────────────────────────────────────────
def test_travel_context_requires_dates():
    no = travel_context(HOTEL)
    assert no["ok"] is False
    yes = travel_context(HOTEL + CTX + "&selected_currency=INR")
    assert yes["ok"] is True
    assert yes["checkin"] == "2026-08-10" and yes["checkout"] == "2026-08-14"
    assert yes["currency"] == "INR"


def test_no_dates_returns_context_message_not_a_price():
    ex = get_extractor(HOTEL)
    r = ex("<html></html>", HOTEL)
    assert r.context_ok is False
    assert "dates" in (r.message or "").lower()
    assert r.hits == []


# ── Region fixtures: each must yield a native-currency price ─────────────────
@pytest.mark.parametrize("name,country,currency", [
    ("booking_in", "in", "INR"),
    ("booking_ae", "ae", "AED"),
    ("booking_gb", "gb", "GBP"),
])
def test_region_fixture_extracts_native_price(name, country, currency):
    html = _load(name)
    url = HOTEL + CTX + f"&selected_currency={currency}"
    r = get_extractor(url)(html, url)
    assert r.context_ok is True
    assert r.hits, f"{name}: no price extracted"
    h = r.hits[0]
    assert h.native_currency == currency
    assert h.native_price and h.native_price > 0
    # USD normalization present for known currencies.
    assert h.normalized_price_usd and h.normalized_price_usd > 0


def test_native_currency_preserved():
    html = _load("booking_in")
    url = HOTEL + CTX + "&selected_currency=INR"
    h = get_extractor(url)(html, url).hits[0]
    assert h.native_currency == "INR"
    # The on-page value, not a USD guess.
    assert h.native_price >= 1000  # INR totals are large


def test_raw_evidence_preserved():
    html = _load("booking_in")
    url = HOTEL + CTX + "&selected_currency=INR"
    h = get_extractor(url)(html, url).hits[0]
    assert h.raw_text and any(c.isdigit() for c in h.raw_text)
    assert h.extraction_method.startswith("booking_")
    assert h.source  # selector / json key recorded
    # Tax inclusion is flagged unknown when taxes are shown separately.
    assert isinstance(h.includes_taxes_unknown, bool)


def test_no_price_fixture_yields_no_hits():
    # The no-dates page has no rate table → context gate stops it before parsing,
    # and even if parsed, no b_raw_price rooms → no hits.
    html = _load("booking_no_dates")
    r = get_extractor(HOTEL)(html, HOTEL)  # no dates in URL
    assert r.context_ok is False
    assert r.hits == []


# ── Fallback + regression ───────────────────────────────────────────────────
def test_unsupported_site_uses_generic_parser():
    # The registry returns None for Amazon → main keeps using parse_page_prices.
    assert get_extractor("https://www.amazon.ae/dp/B0FL4HLJ56/") is None


def test_amazon_generic_parser_unchanged():
    # A minimal Amazon-shaped page still extracts via the generic parser,
    # untouched by Stage 2.
    html = (
        '<html><body><div id="corePrice_feature_div">'
        '<span class="a-offscreen">AED 11,600.00</span></div></body></html>'
    )
    prices = M.parse_page_prices(html, "https://www.amazon.ae/dp/B0FL4HLJ56/")
    assert prices and abs(prices[0] - 3158.68) < 0.5  # AED→USD
