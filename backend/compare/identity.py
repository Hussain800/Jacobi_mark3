"""Jacobi Compare — deterministic electronics identity resolver.

Resolution order (PDR FR-3): GTIN -> MPN -> brand+model -> structured title
parsing. No LLM anywhere in this module; every extraction records its source
and confidence so the equivalence engine can explain itself.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from .schemas import (
    CurrentOfferInput,
    IdentityEvidence,
    ProductIdentity,
    Variant,
)

# Brands we recognise in titles. Matching is word-boundary, case-insensitive.
KNOWN_BRANDS = [
    "Sony", "Apple", "Samsung", "Bose", "JBL", "Sennheiser", "Anker", "Soundcore",
    "Dell", "HP", "Lenovo", "Asus", "Acer", "MSI", "Microsoft", "Huawei", "Xiaomi",
    "OnePlus", "Google", "LG", "Philips", "Logitech", "Razer", "Canon", "Nikon",
    "GoPro", "DJI", "Garmin", "Beats", "Nothing", "Honor", "Realme", "Dyson",
]

_COLOURS = {
    "black", "white", "silver", "gray", "grey", "blue", "red", "green", "gold",
    "rose gold", "pink", "purple", "midnight", "starlight", "graphite", "titanium",
    "space gray", "space grey", "space black", "smoky pink", "platinum silver",
    "midnight blue", "sand", "cream", "beige", "navy", "orange", "yellow",
}
# Longest first so "space gray" wins over "gray".
_COLOURS_ORDERED = sorted(_COLOURS, key=len, reverse=True)

# Sony-style model colour suffixes: WH-1000XM6/B -> base WH-1000XM6, colour black.
_MODEL_COLOUR_SUFFIX = {
    "B": "black", "S": "silver", "W": "white", "L": "blue", "P": "pink", "N": "gold",
}

_REGION_PATTERNS = [
    (re.compile(r"\buae\b|\bgcc\b|middle\s*east", re.I), "uae"),
    (re.compile(r"\binternational\s+(version|variant|model)\b", re.I), "international"),
    (re.compile(r"\bus\s+(version|variant|model)\b", re.I), "us"),
    (re.compile(r"\beu\s+(version|variant|model)\b", re.I), "eu"),
]

_CONNECTIVITY_PATTERNS = [
    (re.compile(r"wi[- ]?fi\s*\+\s*cellular", re.I), "wifi+cellular"),
    (re.compile(r"\b5g\b", re.I), "5g"),
    (re.compile(r"\b4g\b|\blte\b", re.I), "4g"),
    (re.compile(r"wi[- ]?fi\b", re.I), "wifi"),
]

_CAPACITY_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(TB|GB)\b", re.I)
_SIZE_RE = re.compile(r"(\d{2}(?:\.\d)?)\s*(?:-?\s*inch|\")", re.I)
# Model-number-looking token: letters+digits mix, >=4 chars, may contain - or /.
_MODEL_TOKEN_RE = re.compile(r"\b(?=[A-Z0-9/-]*\d)(?=[A-Z0-9/-]*[A-Z])[A-Z0-9][A-Z0-9/-]{3,}\b")

_MARKETING_TOKENS = re.compile(
    r"\b(new|original|genuine|official|latest|2\d{3}\s+model|free\s+shipping|"
    r"best\s+seller|hot|sale|offer|deal)\b",
    re.I,
)


def normalize_model(raw: Optional[str]) -> Optional[str]:
    """Canonical model string: uppercase, single spaces, no trailing colour suffix."""
    if not raw:
        return None
    m = re.sub(r"\s+", " ", raw.strip().upper())
    return m or None


def split_model_colour_suffix(model: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """'WH-1000XM6/B' -> ('WH-1000XM6', 'black'). Unknown suffixes stay attached."""
    if not model:
        return None, None
    m = re.match(r"^(.*?)/([A-Z])$", model)
    if m and m.group(2) in _MODEL_COLOUR_SUFFIX:
        return m.group(1), _MODEL_COLOUR_SUFFIX[m.group(2)]
    return model, None


def normalize_gtin(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    return digits if 8 <= len(digits) <= 14 else None


def _normalize_capacity(num: str, unit: str) -> str:
    n = num.rstrip("0").rstrip(".") if "." in num else num
    return f"{n}{unit.upper()}"


def parse_capacities(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Return (storage, memory). Heuristics:
    - 'xGB RAM' / 'xGB memory' -> memory
    - '8GB/256GB' or two values -> smaller(<=64GB)=memory, larger=storage
    - single value -> storage
    """
    matches = list(_CAPACITY_RE.finditer(text))
    if not matches:
        return None, None
    storage: Optional[str] = None
    memory: Optional[str] = None
    remaining = []
    for m in matches:
        val = _normalize_capacity(m.group(1), m.group(2))
        after = text[m.end(): m.end() + 12].lower()
        if re.match(r"\s*(ram|memory|unified)", after):
            memory = memory or val
        else:
            remaining.append(val)

    def _gb(v: str) -> float:
        n = float(v[:-2])
        return n * 1024 if v.endswith("TB") else n

    if remaining:
        if memory is None and len(remaining) >= 2:
            vals = sorted(remaining, key=_gb)
            if _gb(vals[0]) <= 64:
                memory = vals[0]
                storage = vals[-1]
            else:
                storage = vals[-1]
        else:
            storage = max(remaining, key=_gb)
    return storage, memory


def parse_colour(text: str) -> Optional[str]:
    low = f" {text.lower()} "
    for c in _COLOURS_ORDERED:
        if re.search(rf"(?<![a-z]){re.escape(c)}(?![a-z])", low):
            return c
    return None


def parse_region(text: str) -> Optional[str]:
    for pat, region in _REGION_PATTERNS:
        if pat.search(text):
            return region
    return None


def parse_connectivity(text: str) -> Optional[str]:
    for pat, conn in _CONNECTIVITY_PATTERNS:
        if pat.search(text):
            return conn
    return None


def parse_size(text: str) -> Optional[str]:
    m = _SIZE_RE.search(text)
    if not m:
        return None
    n = m.group(1)
    n = n.rstrip("0").rstrip(".") if "." in n else n
    return f"{n}in"


def parse_brand(text: str) -> Optional[str]:
    for brand in KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", text, re.I):
            return brand
    return None


def guess_model_from_title(title: str, brand: Optional[str]) -> Optional[str]:
    """Best-effort model token from a noisy title. Deterministic: first
    model-looking token after stripping marketing noise and capacities."""
    cleaned = _MARKETING_TOKENS.sub(" ", title)
    cleaned = _CAPACITY_RE.sub(" ", cleaned)
    if brand:
        cleaned = re.sub(rf"\b{re.escape(brand)}\b", " ", cleaned, flags=re.I)
    for tok in _MODEL_TOKEN_RE.finditer(cleaned.upper()):
        t = tok.group(0).strip("/-")
        # Skip pure sizes like 13IN and connector noise
        if re.fullmatch(r"\d+(IN|HZ|W|MAH|MM)", t):
            continue
        return t
    return None


def resolve_identity(
    fields: CurrentOfferInput | Dict[str, Any],
    category: str = "electronics",
) -> ProductIdentity:
    """Build a ProductIdentity from structured page fields.

    Confidence ladder (deterministic identifiers first):
      gtin present 0.99 | mpn 0.95 | explicit brand+model 0.88
      | title-parsed model 0.70 | otherwise 0.30 (unresolved)
    """
    if isinstance(fields, CurrentOfferInput):
        data = fields.model_dump()
    else:
        data = dict(fields)

    title = data.get("title") or ""
    evidence: List[IdentityEvidence] = []

    def note(field: str, value: Optional[str], source: str, conf: float) -> None:
        if value:
            evidence.append(IdentityEvidence(field=field, value=str(value), source=source, confidence=conf))

    gtin = normalize_gtin(data.get("gtin"))
    note("gtin", gtin, "json_ld", 0.99)

    mpn = normalize_model(data.get("mpn"))
    note("mpn", mpn, "json_ld", 0.95)

    explicit_model = normalize_model(data.get("model"))
    model_source = "json_ld" if explicit_model else "title"
    model = explicit_model
    brand = data.get("brand") or parse_brand(title)
    if not model and title:
        model = guess_model_from_title(title, brand)
    note("brand", brand, "json_ld" if data.get("brand") else "title", 0.9 if data.get("brand") else 0.7)

    # Colour suffix on model (Sony style) doubles as colour evidence.
    base_model, suffix_colour = split_model_colour_suffix(model)
    note("model", model, model_source, 0.95 if explicit_model else 0.7)

    storage, memory = parse_capacities(title)
    colour = suffix_colour or parse_colour(title)
    region = parse_region(title)
    connectivity = parse_connectivity(title)
    size = parse_size(title)
    for f, v in [("storage", storage), ("memory", memory), ("colour", colour),
                 ("region", region), ("connectivity", connectivity), ("size", size)]:
        note(f, v, "title", 0.7)

    if gtin:
        confidence = 0.99
    elif mpn:
        confidence = 0.95
    elif brand and explicit_model:
        confidence = 0.88
    elif model:
        confidence = 0.70
    else:
        confidence = 0.30

    return ProductIdentity(
        category=category,
        brand=brand,
        model=base_model,
        mpn=mpn,
        gtins=[gtin] if gtin else [],
        variant=Variant(
            storage=storage,
            memory=memory,
            colour=colour,
            size=size,
            connectivity=connectivity,
            region=region,
        ),
        identity_confidence=confidence,
        evidence=evidence,
    )
