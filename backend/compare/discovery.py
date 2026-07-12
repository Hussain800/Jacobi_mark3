"""Offer-discovery normalization and deterministic deduplication utilities."""

from __future__ import annotations

import json
import re
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .schemas import OfferObservation

_TRACKING_KEYS = {
    "ascsubtag", "campaign", "campaignid", "clickid", "fbclid", "gclid",
    "mc_cid", "mc_eid", "ref", "ref_", "referrer", "source", "tag",
    "tracking_id", "yclid",
}
_TRACKING_PREFIXES = ("utm_", "pk_", "ga_")
_SPACE_RE = re.compile(r"\s+")


def canonicalize_offer_url(url: str) -> str:
    """Remove fragments/tracking while retaining product-selection parameters."""
    raw = str(url or "").strip()
    parts = urlsplit(raw)
    if not parts.scheme or not parts.hostname:
        return raw
    scheme = parts.scheme.lower()
    host = parts.hostname.lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    port = parts.port
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        host = f"{host}:{port}"
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in _TRACKING_KEYS
        and not key.lower().startswith(_TRACKING_PREFIXES)
    ]
    query.sort(key=lambda pair: (pair[0].lower(), pair[1]))
    path = parts.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit((scheme, host, path, urlencode(query, doseq=True), ""))


def deduplicate_urls(urls: Iterable[str]) -> list[str]:
    """Keep the first evidence URL for each tracking-normalized destination."""
    seen: set[str] = set()
    output: list[str] = []
    for url in urls:
        key = canonicalize_offer_url(url)
        if key in seen:
            continue
        seen.add(key)
        output.append(url)
    return output


def _normal_text(value: object) -> str:
    return _SPACE_RE.sub(" ", str(value or "").strip().lower())


def _variant_key(offer: OfferObservation) -> str:
    data = offer.product.variant.model_dump(exclude_none=True)
    for key in ("bundle", "accessories"):
        if key in data:
            data[key] = sorted(_normal_text(item) for item in data[key])
    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=str).lower()


def _semantic_key(offer: OfferObservation) -> tuple[str, ...] | None:
    product = offer.product
    if product.gtins:
        identity = f"gtin:{sorted(product.gtins)[0]}"
    elif product.mpn:
        identity = f"mpn:{_normal_text(product.mpn)}"
    elif product.brand and product.model:
        identity = f"model:{_normal_text(product.brand)}:{_normal_text(product.model)}"
    else:
        return None
    host = (urlsplit(offer.source_url).hostname or "").lower()
    seller = _normal_text(offer.seller.name or offer.merchant_name or offer.merchant_id)
    return (
        host,
        seller,
        identity,
        _variant_key(offer),
        offer.condition.value,
    )


def _quality(offer: OfferObservation) -> tuple[float, int, int, float]:
    identifiers = len(offer.product.gtins) + int(bool(offer.product.mpn)) + int(bool(offer.product.model))
    complete_cost_fields = int(offer.price.shipping is not None) + int(offer.price.taxes is not None)
    return (
        float(offer.extraction_confidence),
        identifiers,
        complete_cost_fields,
        offer.observed_at.timestamp(),
    )


def deduplicate_offers(offers: Iterable[OfferObservation]) -> list[OfferObservation]:
    """Deduplicate tracking URLs and repeated seller/product/variant offers.

    Different marketplace sellers and materially different variants remain
    separate. When duplicate observations differ in quality, the stronger and
    fresher structured observation is retained.
    """
    output: list[OfferObservation] = []
    url_indexes: dict[str, int] = {}
    semantic_indexes: dict[tuple[str, ...], int] = {}

    for offer in offers:
        url_key = canonicalize_offer_url(offer.source_url)
        semantic_key = _semantic_key(offer)
        existing_index = url_indexes.get(url_key)
        if existing_index is None and semantic_key is not None:
            existing_index = semantic_indexes.get(semantic_key)
        if existing_index is None:
            existing_index = len(output)
            output.append(offer)
        elif _quality(offer) > _quality(output[existing_index]):
            output[existing_index] = offer
        url_indexes[url_key] = existing_index
        if semantic_key is not None:
            semantic_indexes[semantic_key] = existing_index
    return output

