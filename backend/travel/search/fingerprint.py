"""Material-only intent fingerprints used for SPA idempotency and caching."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from ..domain.flight import FlightIntent
from ..domain.hotel import HotelIntent


def _json_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _flight_material(intent: FlightIntent) -> dict[str, Any]:
    selected = intent.selected_itinerary
    return {
        "vertical": "flight",
        "trip_type": intent.trip_type,
        "legs": [
            {
                "origin": leg.origin_airport,
                "destination": leg.destination_airport,
                "departure_date": leg.departure_date,
            }
            for leg in intent.legs
        ],
        "passengers": intent.passengers.model_dump(mode="python"),
        "requested_cabin": intent.requested_cabin,
        "selected_itinerary": (
            {
                "segments": [
                    {
                        "origin": item.origin_airport,
                        "destination": item.destination_airport,
                        "departure": item.scheduled_departure,
                        "operating_carrier": item.operating_carrier,
                        "flight_number": item.flight_number,
                    }
                    for item in selected.segments
                ],
                "cabin": selected.cabin,
                "checked_bags_included": selected.checked_bags_included,
                "fare_restriction_class": selected.fare_restriction_class,
                "refundable": selected.refundable,
                "changeable": selected.changeable,
                "ticketing_structure": selected.ticketing_structure,
            }
            if selected
            else None
        ),
        "baggage_requirements": (
            intent.baggage_requirements.model_dump(mode="python")
            if intent.baggage_requirements
            else None
        ),
        "refundability_preference": intent.refundability_preference,
        "changeability_preference": intent.changeability_preference,
        "market": intent.market,
        "display_currency": intent.display_currency,
    }


def _hotel_material(intent: HotelIntent) -> dict[str, Any]:
    rate = intent.selected_rate
    property_hint = intent.property_hint
    return {
        "vertical": "hotel",
        "property": {
            "canonical_property_id": property_hint.canonical_property_id,
            "official_property_id": property_hint.official_property_id,
            "provider_property_id": property_hint.provider_property_id,
            "name": property_hint.name.casefold().strip(),
            "address": property_hint.address.casefold().strip() if property_hint.address else None,
            "postal_code": property_hint.postal_code,
            "latitude": property_hint.latitude,
            "longitude": property_hint.longitude,
            "official_domain": property_hint.official_domain,
        },
        "check_in": intent.check_in,
        "check_out": intent.check_out,
        "rooms": [room.model_dump(mode="python") for room in intent.rooms],
        "selected_rate": (
            {
                "room_family": rate.room_family,
                "bed_configuration": rate.bed_configuration,
                "meal_plan": rate.meal_plan,
                "refundable": rate.refundable,
                "cancellation_deadline": rate.cancellation_deadline,
                "payment_timing": rate.payment_timing,
                "occupancy": rate.occupancy.model_dump(mode="python"),
                "private_bathroom": rate.private_bathroom,
                "guaranteed_room": rate.guaranteed_room,
            }
            if rate
            else None
        ),
        "market": intent.market,
        "display_currency": intent.display_currency,
    }


def intent_fingerprint(intent: FlightIntent | HotelIntent) -> str:
    material = _flight_material(intent) if isinstance(intent, FlightIntent) else _hotel_material(intent)
    payload = json.dumps(
        _json_value(material), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
