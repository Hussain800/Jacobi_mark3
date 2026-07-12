"""Jacobi Compare — deterministic electronics identity resolver.

Resolution order (PDR FR-3): GTIN -> MPN -> brand+model -> structured title
parsing. No LLM anywhere in this module; every extraction records its source
and confidence so the equivalence engine can explain itself.
"""

from __future__ import annotations

import re
import hashlib
from typing import Any, Dict, List, Optional, Tuple

from .schemas import (
    CurrentOfferInput,
    IdentityContradiction,
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

_BRAND_CANONICAL = {brand.lower(): brand for brand in KNOWN_BRANDS}
_BRAND_CANONICAL.update({
    "asus": "Asus",
    "hp": "HP",
    "lg": "LG",
    "msi": "MSI",
    "dji": "DJI",
    "jbl": "JBL",
})

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
_YEAR_RE = re.compile(r"\b(20[1-3]\d)\b")
_GENERATION_RE = re.compile(
    r"\b((?:[1-9]|1[0-9])(?:st|nd|rd|th)\s+gen(?:eration)?|m[1-9]|"
    r"snapdragon\s+[0-9a-z+ -]+\s+gen\s+\d|20[1-3]\d)\b",
    re.I,
)
_PROCESSOR_PATTERNS = [
    re.compile(r"\bIntel\s+(?:Core\s+)?Ultra\s+[3579](?:\s+\d{3}[A-Z]?)?\b", re.I),
    re.compile(r"\bIntel\s+Core\s+i[3579](?:[- ]\d{4,5}[A-Z]{0,2})?\b", re.I),
    re.compile(r"\bAMD\s+Ryzen\s+[3579](?:\s+\d{4}[A-Z]{0,2})?\b", re.I),
    re.compile(r"\bApple\s+M[1-9](?:\s+(?:Pro|Max|Ultra))?\b", re.I),
    re.compile(r"\bSnapdragon\s+[0-9A-Z+ -]+(?:Gen\s+\d)?\b", re.I),
]
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


def parse_year(text: str) -> Optional[int]:
    match = _YEAR_RE.search(text)
    return int(match.group(1)) if match else None


def parse_generation(text: str) -> Optional[str]:
    match = _GENERATION_RE.search(text)
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else None


def parse_processor(text: str) -> Optional[str]:
    for pattern in _PROCESSOR_PATTERNS:
        match = pattern.search(text)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).strip()
    return None


def canonicalize_brand(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    cleaned = re.sub(r"\s+", " ", str(raw)).strip()
    return _BRAND_CANONICAL.get(cleaned.lower(), cleaned)


def normalize_region(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    value = str(raw).strip().lower()
    if value in {"ae", "uae", "gcc", "middle east", "united arab emirates", "local"}:
        return "uae"
    return value


def normalize_capacity(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    match = _CAPACITY_RE.search(str(raw))
    return _normalize_capacity(match.group(1), match.group(2)) if match else str(raw).strip().upper()


def parse_brand(text: str) -> Optional[str]:
    for brand in KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", text, re.I):
            return canonicalize_brand(brand)
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
        if re.fullmatch(r"\d+-?(INCH|IN|HZ|W|MAH|MM)", t):
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
    data = fields.model_dump() if isinstance(fields, CurrentOfferInput) else dict(fields)
    title = str(data.get("title") or "")
    evidence: List[IdentityEvidence] = []
    contradictions: List[IdentityContradiction] = []
    aliases: Dict[str, List[str]] = {}

    def note(
        field: str,
        value: Any,
        source: str,
        confidence: float,
        raw_value: Any = None,
    ) -> None:
        if value is None or value == "" or value == []:
            return
        evidence.append(IdentityEvidence(
            field=field,
            value=str(value),
            source=source,
            confidence=confidence,
            raw_value=str(raw_value) if raw_value is not None else None,
        ))

    def conflict(field: str, structured: Any, parsed: Any) -> None:
        if structured is None or parsed is None:
            return
        left = str(structured).strip().lower()
        right = str(parsed).strip().lower()
        if left == right:
            return
        contradictions.append(IdentityContradiction(
            field=field,
            values=[str(structured), str(parsed)],
            sources=["structured", "title"],
            explanation=f"Structured {field} conflicts with the value parsed from the title.",
        ))

    raw_brand = data.get("brand")
    structured_brand = canonicalize_brand(raw_brand)
    title_brand = parse_brand(title)
    brand = structured_brand or title_brand
    conflict("brand", structured_brand, title_brand)
    if raw_brand:
        aliases["brand"] = [str(raw_brand)]
    note("brand", brand, "structured" if structured_brand else "title", 0.95 if structured_brand else 0.72, raw_brand)

    raw_gtin = data.get("gtin")
    gtin = normalize_gtin(raw_gtin)
    note("gtin", gtin, "structured", 0.99, raw_gtin)

    raw_mpn = data.get("mpn")
    mpn = normalize_model(raw_mpn)
    note("mpn", mpn, "structured", 0.97, raw_mpn)

    raw_sku = data.get("sku")
    sku = str(raw_sku).strip() if raw_sku else None
    note("sku", sku, "structured", 0.85, raw_sku)

    explicit_model = normalize_model(data.get("model"))
    title_model = guess_model_from_title(title, title_brand or structured_brand) if title else None
    conflict("model", explicit_model, title_model)
    model = explicit_model or title_model
    base_model, suffix_colour = split_model_colour_suffix(model)
    note("model", base_model, "structured" if explicit_model else "title", 0.96 if explicit_model else 0.72, data.get("model"))

    family = str(data.get("family")).strip() if data.get("family") else None
    note("family", family, "structured", 0.9)

    parsed_storage, parsed_memory = parse_capacities(title)
    structured_storage = normalize_capacity(data.get("storage"))
    structured_memory = normalize_capacity(data.get("memory"))
    conflict("storage", structured_storage, parsed_storage)
    conflict("memory", structured_memory, parsed_memory)
    storage = structured_storage or parsed_storage
    memory = structured_memory or parsed_memory

    parsed_colour = suffix_colour or parse_colour(title)
    structured_colour = str(data.get("colour")).strip().lower() if data.get("colour") else None
    conflict("colour", structured_colour, parsed_colour)
    colour = structured_colour or parsed_colour

    parsed_region = parse_region(title)
    structured_region = normalize_region(data.get("region"))
    conflict("region", structured_region, parsed_region)
    region = structured_region or parsed_region

    parsed_connectivity = parse_connectivity(title)
    structured_connectivity = str(data.get("connectivity")).strip().lower() if data.get("connectivity") else None
    conflict("connectivity", structured_connectivity, parsed_connectivity)
    connectivity = structured_connectivity or parsed_connectivity

    parsed_size = parse_size(title)
    structured_size = str(data.get("screen_size")).strip().lower() if data.get("screen_size") else None
    conflict("screen_size", structured_size, parsed_size)
    screen_size = structured_size or parsed_size

    generation = str(data.get("generation")).strip() if data.get("generation") else parse_generation(title)
    processor = str(data.get("processor")).strip() if data.get("processor") else parse_processor(title)
    year = data.get("year") or parse_year(title)
    bundle = [str(value).strip() for value in data.get("bundle", []) if str(value).strip()]
    accessories = [str(value).strip() for value in data.get("accessories", []) if str(value).strip()]
    warranty_region = normalize_region(data.get("warranty_region"))
    if not warranty_region:
        warranty_region = parse_region(str(data.get("warranty_text") or ""))

    parsed_fields = [
        ("storage", storage, structured_storage),
        ("memory", memory, structured_memory),
        ("colour", colour, structured_colour),
        ("region", region, structured_region),
        ("connectivity", connectivity, structured_connectivity),
        ("screen_size", screen_size, structured_size),
        ("generation", generation, data.get("generation")),
        ("processor", processor, data.get("processor")),
        ("year", year, data.get("year")),
        ("warranty_region", warranty_region, data.get("warranty_region")),
    ]
    for field, value, structured in parsed_fields:
        note(field, value, "structured" if structured is not None else "title", 0.9 if structured is not None else 0.7)
    note("bundle", bundle, "structured", 0.9)
    note("accessories", accessories, "structured", 0.9)

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
    if contradictions:
        confidence = min(confidence, 0.65)

    confidence_by_field = {
        item.field: max(item.confidence, 0.0)
        for item in evidence
    }
    values = {
        "brand": brand,
        "family": family,
        "model": base_model,
        "mpn": mpn,
        "gtin": gtin,
        "sku": sku,
        "storage": storage,
        "memory": memory,
        "generation": generation,
        "processor": processor,
        "screen_size": screen_size,
        "year": year,
        "region": region,
        "colour": colour,
        "connectivity": connectivity,
        "bundle": bundle,
        "accessories": accessories,
        "warranty_region": warranty_region,
    }
    unknown_fields = [
        key for key, value in values.items()
        if value is None or value == []
    ]

    identity_key = gtin or mpn or "|".join([
        brand or "unknown-brand",
        base_model or "unknown-model",
        storage or "",
        memory or "",
        region or "",
    ])
    canonical_id = f"prod_{hashlib.sha256(identity_key.encode('utf-8')).hexdigest()[:16]}"

    return ProductIdentity(
        canonical_id=canonical_id,
        category=category,
        brand=brand,
        family=family,
        model=base_model,
        mpn=mpn,
        gtins=[gtin] if gtin else [],
        sku=sku,
        variant=Variant(
            storage=storage,
            memory=memory,
            colour=colour,
            size=screen_size,
            connectivity=connectivity,
            region=region,
            generation=generation,
            processor=processor,
            screen_size=screen_size,
            year=year,
            bundle=bundle,
            accessories=accessories,
            warranty_region=warranty_region,
        ),
        identity_confidence=confidence,
        confidence_by_field=confidence_by_field,
        evidence=evidence,
        contradictions=contradictions,
        aliases=aliases,
        unknown_fields=unknown_fields,
    )
