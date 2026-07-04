"""
Jacobi for Agents — extractor v0.

Two passes:
  1. data-attr pass: fixture/partner pages annotate machine-readable price
     fields with data-jacobi-field attributes → high confidence.
  2. generic fallback: currency-amount regex scan over visible text → low
     confidence, honestly flagged so scoring can apply LOW_EXTRACTOR_CONFIDENCE.
"""

from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup

from .schemas import Extraction, Money

EXTRACTOR_VERSION = "v0.1"

_MONEY_FIELDS = {"displayed_total", "mandatory_fee", "line_item", "tax"}

# Generic fallback: "AED 2,530", "$1,299.00", "€45", "USD 300"
_CURRENCY_RE = re.compile(
    r"(?P<cur>AED|USD|EUR|GBP|SAR|INR|CAD|AUD|\$|€|£)\s?(?P<amt>\d{1,3}(?:[,.]\d{3})*(?:\.\d{1,2})?)"
)
_SYMBOL_TO_CODE = {"$": "USD", "€": "EUR", "£": "GBP"}


def _parse_amount(raw: str) -> Optional[float]:
    try:
        return float(raw.replace(",", ""))
    except (ValueError, AttributeError):
        return None


def extract_price_fields(html: str, base_confidence: float = 0.95) -> list[Extraction]:
    """Extract price/availability fields from a page. See module docstring."""
    soup = BeautifulSoup(html, "lxml")
    out: list[Extraction] = []

    # Pass 1 — annotated fields.
    for el in soup.select("[data-jacobi-field]"):
        field = el.get("data-jacobi-field", "").strip()
        if not field:
            continue
        selector = f'[data-jacobi-field="{field}"]'
        if field in _MONEY_FIELDS:
            amount = _parse_amount(el.get("data-amount", ""))
            if amount is None:
                continue
            value = {
                "amount": amount,
                "currency": el.get("data-currency", "USD"),
            }
            label = el.get("data-label")
            if label:
                value["label"] = label
            out.append(Extraction(
                field=field,
                value=value,
                selector=selector,
                method="data-attr",
                confidence=base_confidence,
                extractor_version=EXTRACTOR_VERSION,
            ))
        else:
            out.append(Extraction(
                field=field,
                value={"text": el.get("data-value") or el.get_text(strip=True)},
                selector=selector,
                method="data-attr",
                confidence=base_confidence,
                extractor_version=EXTRACTOR_VERSION,
            ))
    if out:
        return out

    # Pass 2 — generic fallback over visible text.
    text = soup.get_text(" ", strip=True)
    matches = _CURRENCY_RE.findall(text)
    if matches:
        # Heuristic: the largest amount on the page is most likely the total.
        cur, amt = max(matches, key=lambda m: _parse_amount(m[1]) or 0.0)
        amount = _parse_amount(amt)
        if amount is not None:
            out.append(Extraction(
                field="displayed_total",
                value={"amount": amount, "currency": _SYMBOL_TO_CODE.get(cur, cur)},
                selector=None,
                method="regex",
                confidence=0.4,
                extractor_version=EXTRACTOR_VERSION,
            ))
    title = soup.title.get_text(strip=True) if soup.title else ""
    if title:
        out.append(Extraction(
            field="page_title",
            value={"text": title},
            selector="title",
            method="css",
            confidence=0.9,
            extractor_version=EXTRACTOR_VERSION,
        ))
    return out


def money_from_extraction(e: Extraction) -> Optional[Money]:
    v = e.value
    if isinstance(v, dict) and "amount" in v:
        return Money(
            amount=float(v["amount"]),
            currency=str(v.get("currency", "USD")),
            label=v.get("label"),
        )
    return None
