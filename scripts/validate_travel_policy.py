"""Validate travel provider policy, retention, and study documentation."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
LEDGER = REPO_ROOT / "backend" / "travel" / "providers" / "policy_ledger.json"
PROVIDER_DOC = REPO_ROOT / "docs" / "travel" / "PROVIDER_POLICY.md"
RETENTION_DOC = REPO_ROOT / "docs" / "travel" / "RETENTION_AND_DELETION.md"
STUDY_DOC = REPO_ROOT / "docs" / "travel" / "CONSENTED_SESSION_STUDY.md"
FUTURE_PROVIDERS = {
    "booking_demand_api",
    "expedia_rapid_api",
    "skyscanner_travel_api",
}
FUTURE_PAGE_ADAPTERS = {
    "booking_production_page_adapter",
    "expedia_production_page_adapter",
    "skyscanner_production_page_adapter",
}
REQUIRED_SOURCE_FIELDS = {
    "source_id",
    "display_name",
    "source_kind",
    "verticals",
    "access_method",
    "allowed_fields",
    "prohibited_fields",
    "retention",
    "implementation_status",
    "enablement",
    "approval",
    "monetization",
}
REQUIRED_RETENTION_FIELDS = {
    "raw_payload_persisted",
    "transient_cache_ttl_seconds",
    "user_linked_policy",
    "deidentified_market_policy",
}


def _read(path: Path) -> str:
    if not path.is_file():
        raise ValueError(f"missing policy artifact: {path.relative_to(REPO_ROOT)}")
    return path.read_text(encoding="utf-8")


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def validate_policy_contract() -> list[str]:
    errors: list[str] = []
    try:
        ledger = json.loads(_read(LEDGER))
    except (ValueError, json.JSONDecodeError) as exc:
        return [str(exc)]
    if ledger.get("schema_version") != 1:
        errors.append("policy ledger schema_version must be 1")

    separation = _mapping(ledger.get("ranking_monetization_separation"))
    if separation.get("enforced") is not True:
        errors.append("ranking/monetization separation must be enforced")
    forbidden = set(separation.get("forbidden_inputs") or [])
    for field in ("affiliate_commission", "revenue_share", "sponsored_placement"):
        if field not in forbidden:
            errors.append(f"ranking separation missing forbidden input: {field}")

    sources = ledger.get("sources")
    if not isinstance(sources, list) or not sources:
        return errors + ["policy ledger sources must be a non-empty list"]
    source_ids: set[str] = set()
    by_id: dict[str, dict[str, Any]] = {}
    for index, raw_source in enumerate(sources):
        source = _mapping(raw_source)
        source_id = str(source.get("source_id") or f"index-{index}")
        missing = REQUIRED_SOURCE_FIELDS - set(source)
        if missing:
            errors.append(f"{source_id} missing fields: {sorted(missing)}")
            continue
        if source_id in source_ids:
            errors.append(f"duplicate source_id: {source_id}")
        source_ids.add(source_id)
        by_id[source_id] = source
        if source["source_kind"] not in {"provider", "page_adapter"}:
            errors.append(f"{source_id} has invalid source_kind")
        if not source["access_method"] or not source["allowed_fields"]:
            errors.append(f"{source_id} must define access and allowed fields")
        if not source["prohibited_fields"]:
            errors.append(f"{source_id} must define prohibited fields")
        retention = _mapping(source["retention"])
        missing_retention = REQUIRED_RETENTION_FIELDS - set(retention)
        if missing_retention:
            errors.append(
                f"{source_id} retention missing fields: {sorted(missing_retention)}"
            )
        if retention.get("raw_payload_persisted") is not False:
            errors.append(f"{source_id} must not persist raw payloads")
        approval = _mapping(source["approval"])
        for field in (
            "repository_status",
            "production_status",
            "required_external",
            "last_repository_review",
        ):
            if field not in approval:
                errors.append(f"{source_id} approval missing {field}")
        monetization = _mapping(source["monetization"])
        if monetization.get("ranking_input") != "forbidden":
            errors.append(f"{source_id} allows monetization to affect ranking")

    missing_future = FUTURE_PROVIDERS - set(by_id)
    if missing_future:
        errors.append(f"future providers missing from ledger: {sorted(missing_future)}")
    for provider_id in FUTURE_PROVIDERS & set(by_id):
        provider = by_id[provider_id]
        approval = _mapping(provider.get("approval"))
        if provider.get("source_kind") != "provider":
            errors.append(f"{provider_id} must be a provider")
        if provider.get("implementation_status") != "not_implemented":
            errors.append(f"{provider_id} must remain not_implemented")
        if provider.get("enablement") != "disabled":
            errors.append(f"{provider_id} must remain disabled")
        if approval.get("production_status") != "blocked_external":
            errors.append(f"{provider_id} must remain blocked_external")
        if not approval.get("required_external"):
            errors.append(f"{provider_id} must list external blockers")
    missing_adapters = FUTURE_PAGE_ADAPTERS - set(by_id)
    if missing_adapters:
        errors.append(f"future page adapters missing from ledger: {sorted(missing_adapters)}")
    for adapter_id in FUTURE_PAGE_ADAPTERS & set(by_id):
        adapter = by_id[adapter_id]
        approval = _mapping(adapter.get("approval"))
        if adapter.get("source_kind") != "page_adapter":
            errors.append(f"{adapter_id} must be a page_adapter")
        if adapter.get("implementation_status") != "not_implemented":
            errors.append(f"{adapter_id} must remain not_implemented")
        if adapter.get("enablement") != "disabled":
            errors.append(f"{adapter_id} must remain disabled")
        if approval.get("production_status") != "blocked_external":
            errors.append(f"{adapter_id} must remain blocked_external")

    docs: dict[Path, tuple[str, ...]] = {
        PROVIDER_DOC: (
            "policy_ledger.json",
            "Booking.com Demand API",
            "Expedia Rapid API",
            "Skyscanner Travel APIs",
        ),
        RETENTION_DOC: (
            "DELETE /api/v2/travel/user-data",
            "travel_flight_itineraries",
            "Fail-closed",
        ),
        STUDY_DOC: (
            "30–50",
            "No participants have been recruited",
            "Instrumentation validation checklist",
            "No result row may be filled from assumptions",
        ),
    }
    for path, markers in docs.items():
        try:
            content = _read(path)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        for marker in markers:
            if marker not in content:
                errors.append(f"{path.name} missing marker: {marker}")
    return errors


def main() -> int:
    errors = validate_policy_contract()
    if errors:
        print("Travel policy validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("PASS travel provider, retention, and study policy contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
