"""Jacobi Compare — explicit offer-equivalence engine.

Decides whether a candidate offer is the SAME purchasable product as the one
the user is viewing, and explains why. Pure deterministic rules (PDR FR-6);
an LLM never gets authority here.

Hard rejects (mismatch, never recommended):
  GTIN conflict | MPN conflict | model conflict | storage/memory mismatch
  | region mismatch | no deterministic identifier shared at all
Downgrades:
  condition differs           -> similar        (shown separately)
  colour differs              -> exact_tradeoff (disclosed, no headline)
  warranty unknown/different  -> exact_tradeoff
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from .identity import normalize_model, split_model_colour_suffix
from .schemas import (
    Condition,
    EquivalenceClass,
    EquivalenceResult,
    OfferObservation,
    ProductIdentity,
    ReasonCode,
)

# PDR equivalence-score weights — score is reported confidence, classification
# is decided by the rules above it (score can never rescue a hard reject).
_W_IDENTIFIER = 0.30   # exact gtin/mpn
_W_MODEL = 0.20
_W_STORAGE_MEMORY = 0.15
_W_SIZE = 0.10
_W_COLOUR = 0.05
_W_REGION_CONN = 0.10
_W_BUNDLE_CONDITION = 0.10


def _cmp_dim(a: Optional[str], b: Optional[str]) -> str:
    """'match' | 'mismatch' | 'unknown' with case-insensitive equality."""
    if a is None or b is None:
        return "unknown"
    return "match" if str(a).strip().lower() == str(b).strip().lower() else "mismatch"


def _model_pair(identity: ProductIdentity) -> Tuple[Optional[str], Optional[str]]:
    base, colour = split_model_colour_suffix(normalize_model(identity.model))
    return base, colour


def classify(
    current: ProductIdentity,
    current_condition: Condition,
    candidate: OfferObservation,
) -> EquivalenceResult:
    cand = candidate.product
    matched: List[str] = []
    mismatched: List[str] = []
    unknown: List[str] = []
    codes: List[ReasonCode] = []
    notes: List[str] = []

    # ── Deterministic identifiers ────────────────────────────────────────────
    cur_gtins = set(current.gtins)
    cand_gtins = set(cand.gtins)
    gtin_state = "unknown"
    if cur_gtins and cand_gtins:
        gtin_state = "match" if cur_gtins & cand_gtins else "mismatch"

    mpn_state = _cmp_dim(normalize_model(current.mpn), normalize_model(cand.mpn))

    cur_model, cur_suffix_colour = _model_pair(current)
    cand_model, cand_suffix_colour = _model_pair(cand)
    model_state = _cmp_dim(cur_model, cand_model)

    identifier_match = gtin_state == "match" or mpn_state == "match"

    def _finish(cls: EquivalenceClass) -> EquivalenceResult:
        # A GTIN/MPN match pins the exact retail SKU, which pins every variant
        # dimension — so unknown dimensions earn full credit under an
        # identifier match, half credit otherwise. Mismatches earn zero (and
        # were hard-rejected above anyway).
        def credit(state: str, w: float) -> float:
            if state == "match":
                return w
            if state == "unknown":
                return w if identifier_match else w * 0.5
            return 0.0

        def combine(*states: str) -> str:
            if "mismatch" in states:
                return "mismatch"
            return "match" if "match" in states else "unknown"

        score = (_W_IDENTIFIER if identifier_match else 0.0)
        score += credit(model_state, _W_MODEL)
        score += credit(
            combine(_cmp_dim(current.variant.storage, cand.variant.storage),
                    _cmp_dim(current.variant.memory, cand.variant.memory)),
            _W_STORAGE_MEMORY,
        )
        score += credit(_cmp_dim(current.variant.size, cand.variant.size), _W_SIZE)
        score += credit(
            _cmp_dim(current.variant.colour or cur_suffix_colour,
                     cand.variant.colour or cand_suffix_colour),
            _W_COLOUR,
        )
        score += credit(
            combine(_cmp_dim(current.variant.region, cand.variant.region),
                    _cmp_dim(current.variant.connectivity, cand.variant.connectivity)),
            _W_REGION_CONN,
        )
        cond_state = (
            "unknown" if candidate.condition == Condition.unknown
            else ("match" if candidate.condition == current_condition else "mismatch")
        )
        score += credit(cond_state, _W_BUNDLE_CONDITION)
        return EquivalenceResult(
            classification=cls,
            score=round(min(score, 1.0), 3),
            matched_dimensions=matched,
            mismatched_dimensions=mismatched,
            unknown_dimensions=unknown,
            reason_codes=codes,
            explanation=" ".join(notes) if notes else "Exact match on deterministic identifiers.",
        )

    def _record(dim: str, state: str) -> None:
        {"match": matched, "mismatch": mismatched, "unknown": unknown}[state].append(dim)

    for dim, state in [("gtin", gtin_state), ("mpn", mpn_state), ("model", model_state)]:
        _record(dim, state)

    # Hard reject: identifier conflicts.
    if gtin_state == "mismatch":
        codes.append(ReasonCode.VARIANT_MISMATCH)
        notes.append("GTIN differs — this is a different retail product.")
        return _finish(EquivalenceClass.mismatch)
    if mpn_state == "mismatch" and not identifier_match:
        codes.append(ReasonCode.VARIANT_MISMATCH)
        notes.append(f"Manufacturer part number differs ({current.mpn} vs {cand.mpn}).")
        return _finish(EquivalenceClass.mismatch)
    if model_state == "mismatch" and not identifier_match:
        codes.append(ReasonCode.VARIANT_MISMATCH)
        notes.append(f"Model number differs ({cur_model} vs {cand_model}).")
        return _finish(EquivalenceClass.mismatch)

    # No shared deterministic identifier at all -> can never be "exact".
    has_deterministic = identifier_match or model_state == "match"
    if not has_deterministic:
        codes.append(ReasonCode.EXACT_MATCH_INSUFFICIENT)
        notes.append("No shared model number, MPN, or GTIN — cannot verify an exact match.")
        return _finish(EquivalenceClass.similar)

    # ── Variant dimensions ──────────────────────────────────────────────────
    storage_state = _cmp_dim(current.variant.storage, cand.variant.storage)
    memory_state = _cmp_dim(current.variant.memory, cand.variant.memory)
    _record("storage", storage_state)
    _record("memory", memory_state)
    if storage_state == "mismatch" or memory_state == "mismatch":
        codes.append(ReasonCode.VARIANT_MISMATCH)
        which = "Storage" if storage_state == "mismatch" else "Memory"
        cur_v = current.variant.storage if storage_state == "mismatch" else current.variant.memory
        cand_v = cand.variant.storage if storage_state == "mismatch" else cand.variant.memory
        notes.append(f"{which} differs ({cur_v} vs {cand_v}) — different configuration.")
        return _finish(EquivalenceClass.mismatch)

    region_state = _cmp_dim(current.variant.region, cand.variant.region)
    _record("region", region_state)
    if region_state == "mismatch":
        codes.append(ReasonCode.REGION_MISMATCH)
        notes.append(
            f"Regional version differs ({current.variant.region} vs {cand.variant.region}) — "
            "warranty and compatibility may not apply."
        )
        return _finish(EquivalenceClass.mismatch)

    conn_state = _cmp_dim(current.variant.connectivity, cand.variant.connectivity)
    _record("connectivity", conn_state)
    if conn_state == "mismatch":
        codes.append(ReasonCode.VARIANT_MISMATCH)
        notes.append("Connectivity variant differs.")
        return _finish(EquivalenceClass.mismatch)

    # ── Condition ───────────────────────────────────────────────────────────
    cond_state = (
        "unknown"
        if candidate.condition == Condition.unknown
        else ("match" if candidate.condition == current_condition else "mismatch")
    )
    _record("condition", cond_state)
    if cond_state == "mismatch":
        codes.append(ReasonCode.CONDITION_MISMATCH)
        notes.append(
            f"Condition differs: {candidate.condition.value} vs {current_condition.value}. "
            "Shown as an alternative, not an exact match."
        )
        return _finish(EquivalenceClass.similar)
    if cond_state == "unknown":
        notes.append("Seller did not state the condition.")

    # ── Colour (price-relevant tradeoff, never headline) ────────────────────
    colour_state = _cmp_dim(
        current.variant.colour or cur_suffix_colour,
        cand.variant.colour or cand_suffix_colour,
    )
    _record("colour", colour_state)

    # ── Warranty ────────────────────────────────────────────────────────────
    cur_war = (current.variant.other or {}).get("warranty")
    cand_war = candidate.warranty.get("region") if candidate.warranty else None
    warranty_state = "unknown" if not candidate.warranty else "known"
    if warranty_state == "unknown":
        unknown.append("warranty")
    else:
        matched.append("warranty") if cand_war else unknown.append("warranty")

    tradeoff = False
    if colour_state == "mismatch":
        tradeoff = True
        codes.append(ReasonCode.VARIANT_MISMATCH)
        notes.append(
            f"Colour differs ({current.variant.colour or cur_suffix_colour} vs "
            f"{cand.variant.colour or cand_suffix_colour})."
        )
    if warranty_state == "unknown":
        tradeoff = True
        codes.append(ReasonCode.WARRANTY_UNKNOWN)
        notes.append("Warranty terms could not be verified for this offer.")
    elif cand_war and str(cand_war).strip().lower() not in ("uae", "gcc", "local"):
        tradeoff = True
        codes.append(ReasonCode.WARRANTY_MISMATCH)
        notes.append(f"Warranty region is {cand_war}, not UAE-local.")
    if cond_state == "unknown":
        tradeoff = True

    if tradeoff:
        return _finish(EquivalenceClass.exact_tradeoff)

    notes.append("Same product: identifiers, configuration, condition, and warranty align.")
    return _finish(EquivalenceClass.exact)
