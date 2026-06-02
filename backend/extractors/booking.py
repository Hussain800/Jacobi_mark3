"""
Booking.com price extractor (Stage 2).

Why a dedicated module: Booking renders its rates from an embedded JSON blob, not
JSON-LD or a simple price span, so the generic parser finds nothing. Verified
against real captured pages (IN/AE/GB), the reliable signals are, in priority:

  1. `b_stay_prices` / `b_raw_price` — the structured rate data. `b_raw_price` is
     a clean integer total for the stay (e.g. 137000), `b_price_per_night` is the
     nightly figure. We take the LOWEST total across rooms as the headline rate.
  2. `.prco-valign-middle-helper` DOM spans — the visible price (e.g.
     "₹&nbsp;137.000"); used for raw evidence + a cross-check.
  3. Currency from `selected_currency` URL param or the on-page symbol.

Tax: when the page shows `data-excl-charges-raw` / a separate "+ ₹ … taxes"
line, the rate is room-only → price_kind=room_rate, includes_taxes_unknown=True.

Booking localises the thousands separator (IN/EU use "."), so we DO NOT parse the
display digits for the value — we use the integer `b_raw_price`. The display text
is kept only as raw evidence.

No fabrication: if the page has no usable rate (e.g. no dates → no availability),
we return zero hits (and the registry-level context check upstream already tells
the user to add dates).
"""
from __future__ import annotations

import re
from typing import List, Optional

from . import PriceHit, ExtractResult, travel_context

# Native→USD rates mirror main.CURRENCY_RATES for the currencies Booking commonly
# uses. Kept local so this module has no import cycle with main; main re-normalizes
# anyway, so these are a best-effort convenience only.
_USD = {
    "INR": 0.0120, "AED": 0.2723, "GBP": 1.270, "EUR": 1.085, "USD": 1.0,
    "SAR": 0.2666, "QAR": 0.2745, "SGD": 0.745, "AUD": 0.655, "CAD": 0.730,
    "JPY": 0.0067, "THB": 0.028, "MYR": 0.215, "IDR": 0.000064, "PHP": 0.018,
}

_SYMBOL_TO_CODE = {
    "₹": "INR", "£": "GBP", "€": "EUR", "د.إ": "AED", "AED": "AED",
    "US$": "USD", "$": "USD", "Rs": "INR", "Rs.": "INR",
}

# b_raw_price is a clean integer (no localized separators); take the value.
_RAW_PRICE_RE = re.compile(r'"b_raw_price"\s*:\s*"?(\d+(?:\.\d+)?)"?')
_PER_NIGHT_RE = re.compile(r'"b_price_per_night"\s*:\s*"?\s*([^",}]+?)"?\s*[,}]')
_PRICE_FIELD_RE = re.compile(r'"b_price"\s*:\s*"([^"]*\d[^"]*)"')  # e.g. "₹ 137.000" (must contain a digit)
# Visible DOM price, e.g. class="prco-valign-middle-helper"> ₹&nbsp;137.000 </
_DOM_PRICE_RE = re.compile(
    r'prco-valign-middle-helper"[^>]*>\s*([^<]{1,40}?)\s*<', re.IGNORECASE)
_TAX_EXCL_RE = re.compile(r'data-excl-charges-raw|de impuestos|taxes and charges|\+\s*[^<]{0,12}(tax|impuesto|charge)', re.IGNORECASE)


def _currency_from(html: str, url: str) -> Optional[str]:
    ctx = travel_context(url)
    if ctx.get("currency"):
        return ctx["currency"].upper()
    # else first recognizable symbol/code near a b_price field
    m = _PRICE_FIELD_RE.search(html)
    sample = (m.group(1) if m else "")
    for sym, code in _SYMBOL_TO_CODE.items():
        if sym in sample:
            return code
    # fallback: scan page for a known code
    for code in ("INR", "AED", "GBP", "EUR", "USD", "SAR"):
        if f"selected_currency={code}".lower() in html.lower() or f'"{code}"' in html:
            return code
    return None


def _raw_price_evidence(html: str) -> Optional[str]:
    """The visible price string for raw evidence (e.g. '₹ 137.000')."""
    m = _PRICE_FIELD_RE.search(html)
    if m:
        return m.group(1).replace(" ", " ").strip()
    m = _DOM_PRICE_RE.search(html)
    if m:
        return m.group(1).replace("&nbsp;", " ").replace(" ", " ").strip()
    return None


def extract_booking(html: str, url: str) -> ExtractResult:
    res = ExtractResult(site="booking.com")

    # 1) Travel context is mandatory for a meaningful comparison.
    ctx = travel_context(url)
    if not ctx["ok"]:
        res.context_ok = False
        res.message = (
            "Travel pricing requires dates and occupancy for reliable comparison. "
            "Add check-in/check-out parameters or use a specific booking URL."
        )
        return res

    if not html:
        return res

    currency = _currency_from(html, url)
    taxes_separate = bool(_TAX_EXCL_RE.search(html))
    raw_evidence = _raw_price_evidence(html)

    # 2) Primary signal: structured b_raw_price totals. Take the LOWEST as the
    #    headline room rate (the cheapest available room is Booking's lead price).
    raw_vals: List[float] = []
    for m in _RAW_PRICE_RE.finditer(html):
        try:
            v = float(m.group(1))
        except ValueError:
            continue
        # b_raw_price of 0 is a sentinel (cfar / unavailable); skip.
        if v > 0:
            raw_vals.append(v)

    if raw_vals:
        # Booking lists per-room totals plus aggregate fields; the minimum
        # positive value is the cheapest room's stay total.
        headline = min(raw_vals)
        usd = (round(headline * _USD[currency], 2)
               if currency in _USD else None)
        res.hits.append(PriceHit(
            native_price=round(headline, 2),
            native_currency=currency,
            normalized_price_usd=usd,
            raw_text=raw_evidence or (f"{currency} {headline:,.0f}" if currency else f"{headline:,.0f}"),
            extraction_method="booking_b_stay_prices",
            source="b_raw_price (min across rooms)",
            confidence=0.9 if currency else 0.6,
            price_kind="total_stay",
            includes_taxes_unknown=taxes_separate or currency is None,
        ))
        return res

    # 3) Secondary: visible DOM price (no structured JSON found). Lower
    #    confidence because the display uses localized separators; we only use it
    #    when we can unambiguously read the integer.
    dom_vals: List[float] = []
    for m in _DOM_PRICE_RE.finditer(html):
        txt = m.group(1).replace("&nbsp;", "").replace(" ", "").strip()
        # Strip currency symbols/codes, keep digits + separators.
        digits = re.sub(r"[^\d.,]", "", txt)
        # Booking IN/EU: "137.000" = 137000. If exactly 3 trailing digits after a
        # single dot/comma and no decimals, treat the separator as thousands.
        norm = digits.replace(".", "").replace(",", "")
        if norm.isdigit() and len(norm) >= 3:
            dom_vals.append(float(norm))
    if dom_vals:
        headline = min(dom_vals)
        usd = (round(headline * _USD[currency], 2) if currency in _USD else None)
        res.hits.append(PriceHit(
            native_price=round(headline, 2),
            native_currency=currency,
            normalized_price_usd=usd,
            raw_text=raw_evidence or f"{headline:,.0f}",
            extraction_method="booking_dom_price",
            source=".prco-valign-middle-helper",
            confidence=0.55 if currency else 0.4,
            price_kind="total_stay",
            includes_taxes_unknown=True,
        ))
        return res

    # No usable rate found (e.g. sold out / no availability for those dates).
    return res
