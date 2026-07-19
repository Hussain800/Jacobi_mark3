"""Deterministic hotel property and exact-rate classification."""

from __future__ import annotations

from decimal import Decimal
import re

from ..domain.hotel import HotelIntent, HotelOffer, PropertyHint
from .base import FieldDisposition, EquivalenceResult, classify_comparisons, comparison
from .reasons import ReasonCode


def _normalize_text(value: str | None) -> str:
    return "" if value is None else re.sub(r"[^a-z0-9]", "", value.casefold())


def _same_phone(left: str | None, right: str | None) -> bool:
    left_digits = "" if left is None else re.sub(r"\D", "", left)
    right_digits = "" if right is None else re.sub(r"\D", "", right)
    return bool(left_digits and right_digits and left_digits[-8:] == right_digits[-8:])


def _same_domain(left: str | None, right: str | None) -> bool:
    return bool(left and right and left.casefold().removeprefix("www.") == right.casefold().removeprefix("www."))


def _nearby(left: PropertyHint, right: PropertyHint) -> bool:
    if None in {left.latitude, left.longitude, right.latitude, right.longitude}:
        return False
    assert left.latitude is not None and left.longitude is not None
    assert right.latitude is not None and right.longitude is not None
    # About 220 metres at the equator. This is a deterministic identity hint,
    # not a routing-distance calculation.
    tolerance = Decimal("0.002")
    return (
        abs(left.latitude - right.latitude) <= tolerance
        and abs(left.longitude - right.longitude) <= tolerance
    )


def compare_property_identity(baseline: PropertyHint, candidate: PropertyHint):
    id_pairs = (
        ("canonical_property_id", baseline.canonical_property_id, candidate.canonical_property_id),
        ("provider_property_id", baseline.provider_property_id, candidate.provider_property_id),
        ("official_property_id", baseline.official_property_id, candidate.official_property_id),
    )
    for field, left, right in id_pairs:
        if left and right:
            if left == right:
                return comparison(field, FieldDisposition.MATCH, f"Property identity matches by {field}.")
            return comparison(
                field,
                FieldDisposition.REJECTED,
                f"Property identifiers differ for {field}.",
                baseline=left,
                candidate=right,
                reason_code=ReasonCode.PROPERTY_ID_MISMATCH,
            )

    name_matches = _normalize_text(baseline.name) == _normalize_text(candidate.name)
    address_matches = bool(
        baseline.address
        and candidate.address
        and _normalize_text(baseline.address) == _normalize_text(candidate.address)
    )
    postal_matches = bool(
        baseline.postal_code
        and candidate.postal_code
        and _normalize_text(baseline.postal_code) == _normalize_text(candidate.postal_code)
    )
    if name_matches and address_matches and postal_matches:
        return comparison(
            "property_identity",
            FieldDisposition.MATCH,
            "Normalized property name, full address, and postal code match.",
        )
    if _nearby(baseline, candidate) and (
        _same_phone(baseline.phone, candidate.phone)
        or _same_domain(baseline.official_domain, candidate.official_domain)
    ):
        return comparison(
            "property_identity",
            FieldDisposition.MATCH,
            "Property coordinates and a normalized phone or official domain match.",
        )

    candidate_name = _normalize_text(candidate.name)
    baseline_name = _normalize_text(baseline.name)
    reviewed = (
        candidate_name in {_normalize_text(alias) for alias in baseline.reviewed_aliases}
        or baseline_name in {_normalize_text(alias) for alias in candidate.reviewed_aliases}
    )
    if reviewed:
        return comparison(
            "property_identity",
            FieldDisposition.MATCH,
            "A reviewed property alias mapping establishes identity.",
        )
    if name_matches:
        return comparison(
            "property_identity",
            FieldDisposition.INSUFFICIENT,
            "Property name similarity alone cannot establish exact identity.",
            reason_code=ReasonCode.PROPERTY_AMBIGUOUS,
        )
    return comparison(
        "property_identity",
        FieldDisposition.REJECTED,
        "Available property identity evidence does not match.",
        reason_code=ReasonCode.PROPERTY_ID_MISMATCH,
    )


def _normalized_values(values: tuple[str, ...] | None) -> tuple[str, ...] | None:
    if values is None:
        return None
    return tuple(sorted(_normalize_text(value) for value in values))


def classify_hotel_equivalence(intent: HotelIntent, candidate: HotelOffer) -> EquivalenceResult:
    facts = [compare_property_identity(intent.property_hint, candidate.property)]

    dates_match = intent.check_in == candidate.check_in and intent.check_out == candidate.check_out
    facts.append(comparison(
        "dates",
        FieldDisposition.MATCH if dates_match else FieldDisposition.REJECTED,
        "Stay dates match." if dates_match else "Stay dates differ.",
        baseline=f"{intent.check_in}/{intent.check_out}",
        candidate=f"{candidate.check_in}/{candidate.check_out}",
        reason_code=None if dates_match else ReasonCode.DATE_MISMATCH,
    ))

    occupancy_match = intent.rooms == candidate.rooms
    facts.append(comparison(
        "occupancy",
        FieldDisposition.MATCH if occupancy_match else FieldDisposition.REJECTED,
        "Room count and occupancy match." if occupancy_match else "Room count or occupancy differs.",
        baseline=[room.model_dump(mode="json") for room in intent.rooms],
        candidate=[room.model_dump(mode="json") for room in candidate.rooms],
        reason_code=None if occupancy_match else ReasonCode.OCCUPANCY_MISMATCH,
    ))

    baseline_rate = intent.selected_rate
    if baseline_rate is None:
        facts.append(comparison(
            "selected_rate",
            FieldDisposition.INSUFFICIENT,
            "The baseline selected rate is missing material room and policy evidence.",
            reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
        ))
        return classify_comparisons(facts)

    rate = candidate.rate
    if baseline_rate.room_family is None or rate.room_family is None:
        facts.append(comparison(
            "room_family",
            FieldDisposition.INSUFFICIENT,
            "Room-family evidence is incomplete.",
            reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
        ))
    else:
        room_match = _normalize_text(baseline_rate.room_family) == _normalize_text(rate.room_family)
        facts.append(comparison(
            "room_family",
            FieldDisposition.MATCH if room_match else FieldDisposition.REJECTED,
            "Room family matches." if room_match else "Room family differs.",
            baseline=baseline_rate.room_family,
            candidate=rate.room_family,
            reason_code=None if room_match else ReasonCode.ROOM_FAMILY_MISMATCH,
        ))

    baseline_beds = _normalized_values(baseline_rate.bed_configuration)
    candidate_beds = _normalized_values(rate.bed_configuration)
    if baseline_beds is None or candidate_beds is None:
        facts.append(comparison(
            "bed_configuration",
            FieldDisposition.INSUFFICIENT,
            "Guaranteed bed-configuration evidence is incomplete.",
            reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
        ))
    else:
        beds_match = baseline_beds == candidate_beds
        facts.append(comparison(
            "bed_configuration",
            FieldDisposition.MATCH if beds_match else FieldDisposition.REJECTED,
            "Bed configuration matches." if beds_match else "Bed configuration differs.",
            baseline=baseline_beds,
            candidate=candidate_beds,
            reason_code=None if beds_match else ReasonCode.BED_TYPE_MISMATCH,
        ))

    if baseline_rate.meal_plan is None or rate.meal_plan is None:
        facts.append(comparison(
            "meal_plan",
            FieldDisposition.INSUFFICIENT,
            "Meal-plan evidence is incomplete.",
            reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
        ))
    else:
        meal_match = _normalize_text(baseline_rate.meal_plan) == _normalize_text(rate.meal_plan)
        facts.append(comparison(
            "meal_plan",
            FieldDisposition.MATCH if meal_match else FieldDisposition.REJECTED,
            "Meal plan matches." if meal_match else "Meal plan differs.",
            baseline=baseline_rate.meal_plan,
            candidate=rate.meal_plan,
            reason_code=None if meal_match else ReasonCode.MEAL_PLAN_MISMATCH,
        ))

    if baseline_rate.refundable is None or rate.refundable is None:
        facts.append(comparison(
            "refundability",
            FieldDisposition.INSUFFICIENT,
            "Refundability evidence is incomplete.",
            reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
        ))
    else:
        refundable_match = baseline_rate.refundable == rate.refundable
        facts.append(comparison(
            "refundability",
            FieldDisposition.MATCH if refundable_match else FieldDisposition.REJECTED,
            "Refundability matches." if refundable_match else "Refundability differs.",
            baseline=baseline_rate.refundable,
            candidate=rate.refundable,
            reason_code=None if refundable_match else ReasonCode.REFUNDABILITY_MISMATCH,
        ))

    if baseline_rate.refundable and rate.refundable:
        if baseline_rate.cancellation_deadline is None or rate.cancellation_deadline is None:
            facts.append(comparison(
                "cancellation_deadline",
                FieldDisposition.INSUFFICIENT,
                "Cancellation-deadline evidence is incomplete.",
                reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
            ))
        else:
            deadline_match = abs(
                (baseline_rate.cancellation_deadline - rate.cancellation_deadline).total_seconds()
            ) <= 60
            facts.append(comparison(
                "cancellation_deadline",
                FieldDisposition.MATCH if deadline_match else FieldDisposition.REJECTED,
                "Cancellation deadline is semantically equivalent." if deadline_match else "Cancellation deadline differs materially.",
                baseline=baseline_rate.cancellation_deadline,
                candidate=rate.cancellation_deadline,
                reason_code=None if deadline_match else ReasonCode.CANCELLATION_MISMATCH,
            ))

    if baseline_rate.payment_timing is None or rate.payment_timing is None:
        facts.append(comparison(
            "payment_timing",
            FieldDisposition.INSUFFICIENT,
            "Payment-timing evidence is incomplete.",
            reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
        ))
    else:
        payment_match = baseline_rate.payment_timing == rate.payment_timing
        if payment_match:
            disposition = FieldDisposition.MATCH
        elif candidate.payment_timing_material:
            disposition = FieldDisposition.REJECTED
        elif candidate.tradeoff_disclosed:
            disposition = FieldDisposition.TRADEOFF
        else:
            disposition = FieldDisposition.SIMILAR
        facts.append(comparison(
            "payment_timing",
            disposition,
            "Payment timing matches." if payment_match else "Payment timing differs.",
            baseline=baseline_rate.payment_timing,
            candidate=rate.payment_timing,
            reason_code=None if payment_match else ReasonCode.PAYMENT_TIMING_MISMATCH,
        ))

    if candidate.mandatory_fee_basis_complete is True:
        facts.append(comparison(
            "mandatory_fee_basis",
            FieldDisposition.MATCH,
            "Mandatory-fee basis is complete.",
        ))
    else:
        facts.append(comparison(
            "mandatory_fee_basis",
            FieldDisposition.INSUFFICIENT,
            "Mandatory-fee basis is incomplete or unknown.",
            reason_code=ReasonCode.MANDATORY_FEE_UNKNOWN,
        ))

    for field in ("private_bathroom", "guaranteed_room"):
        baseline_value = getattr(baseline_rate, field)
        candidate_value = getattr(rate, field)
        if baseline_value is None:
            continue
        if candidate_value is None:
            facts.append(comparison(
                field,
                FieldDisposition.INSUFFICIENT,
                f"Candidate {field.replace('_', ' ')} evidence is missing.",
                reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
            ))
        else:
            match = baseline_value == candidate_value
            facts.append(comparison(
                field,
                FieldDisposition.MATCH if match else FieldDisposition.REJECTED,
                f"{field.replace('_', ' ').title()} matches." if match else f"{field.replace('_', ' ').title()} differs.",
                reason_code=None if match else ReasonCode.ROOM_FAMILY_MISMATCH,
            ))

    return classify_comparisons(facts)


evaluate_hotel_equivalence = classify_hotel_equivalence

