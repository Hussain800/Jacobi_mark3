from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from api.v2_travel import router
from travel.domain import CostKind, CostState, EquivalenceClass, Money
from travel.costing import CostComponent, summarize_costs
from travel.ranking import RankableCandidate
from travel.search.schemas import RedirectRequest


REPOSITORY = Path(__file__).resolve().parents[3]


def _candidate_payload() -> dict[str, object]:
    return {
        "offer_id": "scope-offer",
        "equivalence": EquivalenceClass.EXACT,
        "costs": summarize_costs(
            [
                CostComponent(
                    kind=CostKind.BASE_FARE,
                    state=CostState.KNOWN,
                    money=Money(amount="500.00", currency="AED"),
                )
            ],
            "AED",
        ),
    }


def test_travel_api_has_no_checkout_payment_or_planner_surface() -> None:
    paths = {route.path.casefold() for route in router.routes}
    assert "/api/v2/travel/redirects" in paths
    for prohibited in ("checkout", "payment", "purchase", "book", "planner", "predict"):
        assert all(prohibited not in path for path in paths)


def test_ranking_and_redirect_contracts_reject_affiliate_inputs() -> None:
    with pytest.raises(ValidationError):
        RankableCandidate.model_validate(
            {**_candidate_payload(), "affiliate_commission": "999.00"}
        )
    with pytest.raises(ValidationError):
        RedirectRequest.model_validate(
            {
                "search_id": "search-1",
                "offer_id": "offer-1",
                "revalidation_id": "revalidation-1",
                "affiliate_code": "rank-me-higher",
            }
        )


def test_extension_permissions_cannot_automate_checkout_or_browse_every_page() -> None:
    manifest = json.loads(
        (REPOSITORY / "extension" / "manifest.json").read_text(encoding="utf-8")
    )
    permissions = set(manifest.get("permissions", []))
    optional = set(manifest.get("optional_permissions", []))
    hosts = set(manifest.get("optional_host_permissions", []))

    assert permissions.isdisjoint(
        {"cookies", "debugger", "webRequest", "webRequestBlocking", "history"}
    )
    assert optional <= {"tabs"}
    assert "<all_urls>" not in hosts
    assert all("*" not in host.split("://", 1)[-1].split("/", 1)[0] for host in hosts)


def test_default_travel_page_is_not_a_planner_or_lowest_price_claim() -> None:
    page = (
        REPOSITORY / "frontend" / "app" / "travel" / "travel-guardian.tsx"
    ).read_text(encoding="utf-8")
    normalized = page.casefold()

    assert "<form" not in normalized
    assert "not the lowest price on the internet" in normalized
    assert "no itinerary re-entry" in normalized
    assert "/chat" in page
    assert "/compare" in page
