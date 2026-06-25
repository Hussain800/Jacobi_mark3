"""Enterprise workspace persistence for the Jacobi price-integrity pivot."""

from __future__ import annotations

import asyncio
import csv
import hashlib
import ipaddress
import io
import math
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlparse

from enterprise_access import EnterprisePermissionError, normalize_role, require_permission
from map_policy import evaluate_map_observation
from supabase_client import get_supabase


DEFAULT_WORKSPACE_NAME = "Jacobi Pilot Workspace"

_MEMORY_WORKSPACES: dict[str, dict[str, Any]] = {}
_ENTERPRISE_SCAN_RATE_BUCKETS: dict[str, list[float]] = {}

ENTERPRISE_SCAN_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("ENTERPRISE_SCAN_RATE_LIMIT_WINDOW_SECONDS", "3600"))
ENTERPRISE_SCAN_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("ENTERPRISE_SCAN_RATE_LIMIT_MAX_REQUESTS", "20"))
ENTERPRISE_SCAN_MAX_TARGETS = int(os.getenv("ENTERPRISE_SCAN_MAX_TARGETS", "250"))
ENTERPRISE_SMART24_EST_COST_USD = float(os.getenv("ENTERPRISE_SMART24_EST_COST_USD", "0.08"))
ENTERPRISE_PRO50_EST_COST_USD = float(os.getenv("ENTERPRISE_PRO50_EST_COST_USD", "0.18"))
ENTERPRISE_SCAN_COST_BUDGET_USD = float(os.getenv("ENTERPRISE_SCAN_COST_BUDGET_USD", "25"))
# Rolling calendar-month BrightData spend cap per organization. 0 disables it;
# operators set this for paid pilots to bound uncontrolled cumulative spend.
ENTERPRISE_SCAN_MONTHLY_BUDGET_USD = float(os.getenv("ENTERPRISE_SCAN_MONTHLY_BUDGET_USD", "0"))
ENTERPRISE_LIVE_SCANS_ENABLED = os.getenv("ENTERPRISE_LIVE_SCANS_ENABLED", "1") != "0"
# A live scan job claimed by a worker that then crashes/freezes would otherwise
# stay 'running' forever. After this lease elapses, the cron worker reclaims it.
ENTERPRISE_SCAN_LEASE_SECONDS = int(os.getenv("ENTERPRISE_SCAN_LEASE_SECONDS", "900"))


class EnterpriseAccessError(Exception):
    """Raised when the caller cannot access an enterprise object."""


class EnterpriseValidationError(Exception):
    """Raised for invalid enterprise workflow input."""


class EnterpriseUnavailableError(Exception):
    """Raised when persistence is required (production) but Supabase is absent.

    Prevents the in-memory fallback from silently masking a misconfigured
    production deploy (no SUPABASE_SERVICE_KEY) by serving ephemeral,
    per-process workspace data that looks live but is never persisted.
    """


def _require_supabase() -> bool:
    """Whether a real Supabase client is mandatory (no in-memory fallback).

    Explicit override ``ENTERPRISE_REQUIRE_SUPABASE`` wins (1/true/on -> require,
    0/false/off -> allow memory). Otherwise auto-detect production from
    APP_ENV / VERCEL_ENV / ENV / NODE_ENV. Local/dev/test (the common case)
    leaves this off so the in-memory fallback still serves offline development
    and the test suite.
    """
    override = os.getenv("ENTERPRISE_REQUIRE_SUPABASE")
    if override is not None and override.strip() != "":
        return override.strip().lower() not in {"0", "false", "no", "off"}
    env = (
        os.getenv("APP_ENV")
        or os.getenv("VERCEL_ENV")
        or os.getenv("ENV")
        or os.getenv("NODE_ENV")
        or ""
    ).strip().lower()
    return env == "production"


def _store_client():
    """Return the Supabase client, or fail closed in production.

    In production we must NOT silently degrade to the in-memory store, so a
    missing/misconfigured persistence backend surfaces as a clear 503 rather
    than a deploy that appears to work while losing all data.
    """
    resolved = get_supabase()
    if resolved is None and _require_supabase():
        raise EnterpriseUnavailableError(
            "Persistence backend is not configured (SUPABASE_SERVICE_KEY missing)."
        )
    return resolved


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id() -> str:
    return str(uuid.uuid4())


def _clean(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def _num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _valid_public_url_shape(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _ip_is_non_public(ip) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _hostname_resolves_public(host: str, resolver=None) -> bool:
    """Best-effort: reject hostnames that resolve to a non-public address.

    Hostnames that cannot be resolved (e.g. reserved demo domains like *.example)
    are ALLOWED at import time — the live-scan worker re-validates every target
    with the full SSRF guard (url_guard.validate_public_url) before any fetch, so
    a non-resolving or DNS-rebinding host is still blocked at the dangerous moment.
    """
    if resolver is None:
        from url_guard import _default_resolver
        resolver = _default_resolver
    try:
        ips = resolver(host)
    except Exception:
        return True
    if not ips:
        return True
    for ip_str in ips:
        try:
            ip = ipaddress.ip_address(ip_str.split("%", 1)[0])
        except ValueError:
            return False
        if _ip_is_non_public(ip):
            return False
    return True


def _safe_import_url_shape(url: str, *, resolver=None) -> bool:
    if not url or len(url) > 2048:
        return False
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False
    host = parsed.hostname.lower().rstrip(".")
    if (
        host in {"localhost", "ip6-localhost", "ip6-loopback", "metadata", "metadata.google.internal"}
        or host.endswith(".localhost")
    ):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        # Hostname (not an IP literal): catch hostnames that resolve to a
        # private/internal address; allow unresolvable demo domains.
        return _hostname_resolves_public(host, resolver)
    return not _ip_is_non_public(ip)


def _domain_from_url(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower()


async def _thread(fn):
    return await asyncio.to_thread(fn)


def _workspace_for_user(user_id: str) -> dict[str, Any]:
    workspace = _MEMORY_WORKSPACES.get(user_id)
    if workspace:
        return workspace

    org = {
        "id": _id(),
        "name": DEFAULT_WORKSPACE_NAME,
        "created_by": user_id,
        "created_at": _now(),
        "updated_at": _now(),
    }
    workspace = {
        "organization": org,
        "members": [{
            "id": _id(),
            "organization_id": org["id"],
            "user_id": user_id,
            "email": None,
            "role": "owner",
            "created_at": _now(),
        }],
        "invites": [],
        "watchlists": [],
        "products": [],
        "sellers": [],
        "watchlist_items": [],
        "scan_jobs": [],
        "findings": [],
        "evidence_items": [],
        "evidence_exports": [],
        "share_tokens": [],
        "audit_log": [],
    }
    _MEMORY_WORKSPACES[user_id] = workspace
    return workspace


def _record_audit(workspace: dict[str, Any], user_id: str, action: str, entity_type: str, entity_id: str, metadata: dict | None = None) -> None:
    workspace["audit_log"].append({
        "id": len(workspace["audit_log"]) + 1,
        "organization_id": workspace["organization"]["id"],
        "actor_user_id": user_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "metadata": metadata or {},
        "created_at": _now(),
    })


def _find_one(rows: list[dict[str, Any]], **query: Any) -> Optional[dict[str, Any]]:
    for row in rows:
        if all(row.get(k) == v for k, v in query.items()):
            return row
    return None


def _memory_role(workspace: dict[str, Any], user_id: str) -> str:
    for member in workspace.get("members", []):
        if member.get("user_id") == user_id:
            return normalize_role(member.get("role"))
    if workspace["organization"].get("created_by") == user_id:
        return "owner"
    return "viewer"


def _require_memory_permission(workspace: dict[str, Any], user_id: str, permission: str) -> None:
    require_permission(_memory_role(workspace, user_id), permission)


def _supabase_membership_role(client, org_id: str, user_id: str) -> str:
    memberships = client.table("organization_members").select("role").eq("organization_id", org_id).eq("user_id", user_id).limit(1).execute().data or []
    if not memberships:
        raise EnterpriseAccessError("Organization not found")
    return normalize_role(memberships[0].get("role"))


def _estimate_job_cost(audit_depth: str, count: int) -> float:
    per_target = ENTERPRISE_PRO50_EST_COST_USD if (audit_depth or "").lower() == "pro50" else ENTERPRISE_SMART24_EST_COST_USD
    return round(per_target * max(0, int(count or 0)), 4)


def _month_start_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


def _job_cost(job: dict[str, Any]) -> float:
    """Realized cost if recorded (completed jobs), else the target-count estimate."""
    realized = _scan_metadata(job).get("realized_cost_usd")
    if realized is not None:
        try:
            return float(realized)
        except (TypeError, ValueError):
            return 0.0
    return _estimate_job_cost(job.get("audit_depth") or "smart24", job.get("target_count") or 0)


def _assert_monthly_budget(month_to_date: float, audit_depth: str, count: int) -> None:
    if ENTERPRISE_SCAN_MONTHLY_BUDGET_USD <= 0:
        return
    projected = round(month_to_date + _estimate_job_cost(audit_depth, count), 4)
    if projected > ENTERPRISE_SCAN_MONTHLY_BUDGET_USD:
        raise EnterpriseValidationError(
            f"Projected monthly scan spend ${projected:.2f} exceeds the workspace budget "
            f"${ENTERPRISE_SCAN_MONTHLY_BUDGET_USD:.2f} (already ${month_to_date:.2f} this month)."
        )


def _enforce_scan_controls(org_id: str, user_id: str, run_mode: str, audit_depth: str, target_count: int, requested_limit: int) -> None:
    if requested_limit > ENTERPRISE_SCAN_MAX_TARGETS:
        raise EnterpriseValidationError(f"Scan limit exceeds workspace maximum of {ENTERPRISE_SCAN_MAX_TARGETS}.")
    if run_mode == "live" and not ENTERPRISE_LIVE_SCANS_ENABLED:
        raise EnterpriseValidationError("Live scans are currently disabled by operations.")
    if run_mode != "live":
        return
    estimated = _estimate_job_cost(audit_depth, target_count)
    if ENTERPRISE_SCAN_COST_BUDGET_USD > 0 and estimated > ENTERPRISE_SCAN_COST_BUDGET_USD:
        raise EnterpriseValidationError(
            f"Estimated scan cost ${estimated:.2f} exceeds budget ${ENTERPRISE_SCAN_COST_BUDGET_USD:.2f}."
        )
    if ENTERPRISE_SCAN_RATE_LIMIT_MAX_REQUESTS <= 0 or ENTERPRISE_SCAN_RATE_LIMIT_WINDOW_SECONDS <= 0:
        return
    key = f"{org_id}:{user_id}"
    now = time.time()
    if len(_ENTERPRISE_SCAN_RATE_BUCKETS) > 4096:
        _cut = now - ENTERPRISE_SCAN_RATE_LIMIT_WINDOW_SECONDS
        for _k in [k for k, v in list(_ENTERPRISE_SCAN_RATE_BUCKETS.items()) if not v or v[-1] < _cut]:
            _ENTERPRISE_SCAN_RATE_BUCKETS.pop(_k, None)
    bucket = [ts for ts in _ENTERPRISE_SCAN_RATE_BUCKETS.get(key, []) if now - ts < ENTERPRISE_SCAN_RATE_LIMIT_WINDOW_SECONDS]
    if len(bucket) >= ENTERPRISE_SCAN_RATE_LIMIT_MAX_REQUESTS:
        retry_after = max(1, math.ceil(ENTERPRISE_SCAN_RATE_LIMIT_WINDOW_SECONDS - (now - bucket[0])))
        _ENTERPRISE_SCAN_RATE_BUCKETS[key] = bucket
        raise EnterpriseValidationError(f"Scan rate limit exceeded. Retry after {retry_after} seconds.")
    bucket.append(now)
    _ENTERPRISE_SCAN_RATE_BUCKETS[key] = bucket


def _normalize_cadence(value: Any) -> str:
    cadence = _clean(value, "weekly").lower()
    return cadence if cadence in {"manual", "daily", "weekly", "monthly"} else "weekly"


def _normalize_workflow(value: Any) -> str:
    workflow = _clean(value, "map").lower()
    return workflow if workflow in {"map", "surveillance"} else "map"


def _normalize_auth_status(value: Any) -> str:
    status = _clean(value, "unknown").lower()
    return status if status in {"authorized", "unauthorized", "unknown"} else "unknown"


def _normalize_scan_mode(value: Any) -> str:
    mode = _clean(value, "live").lower()
    return "imported" if mode in {"imported", "csv", "csv_policy_preview"} else "live"


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _scan_metadata(job: dict[str, Any]) -> dict[str, Any]:
    metadata = job.get("metadata") or {}
    return dict(metadata) if isinstance(metadata, dict) else {}


def _scan_item_ids(job: dict[str, Any]) -> list[str]:
    metadata = _scan_metadata(job)
    ids = metadata.get("item_ids") or []
    if not isinstance(ids, list):
        return []
    return [str(item_id) for item_id in ids if item_id]


def _coverage_from_session(session: dict[str, Any]) -> Optional[float]:
    total = _num(session.get("configured_agents")) or _num(session.get("total_agents"))
    successful = _num(session.get("successful_agents"))
    if total and total > 0 and successful is not None:
        return round(min(100.0, max(0.0, (successful / total) * 100)), 2)
    agents = session.get("agents") or []
    if not agents:
        return None
    priced = [agent for agent in agents if _num(agent.get("price")) is not None]
    return round((len(priced) / len(agents)) * 100, 2) if agents else None


def _buyer_context(agent: dict[str, Any]) -> str:
    variables = agent.get("variables") or {}
    parts = [
        variables.get("location") or agent.get("geo"),
        variables.get("device"),
        variables.get("cookie"),
        variables.get("referrer"),
        agent.get("language_label") or agent.get("browser_language"),
    ]
    label = " / ".join(str(part) for part in parts if part)
    return label or agent.get("label") or agent.get("agent_id") or "Synthetic buyer"


def extract_probe_observations(session: dict[str, Any], default_currency: str = "USD") -> list[dict[str, Any]]:
    """Convert a completed probe session into evidence-ready price observations."""
    observations: list[dict[str, Any]] = []
    for agent in session.get("agents") or []:
        observed = _num(agent.get("price"))
        if observed is None or observed <= 0:
            continue
        evidence = agent.get("evidence") or {}
        native_currency = agent.get("native_currency") or evidence.get("native_currency") or evidence.get("currency_detected")
        observations.append({
            "buyer_context": _buyer_context(agent),
            "observed_price": round(observed, 2),
            "currency": (default_currency or "USD").upper(),
            "metadata": _json_safe({
                "agent_id": agent.get("agent_id"),
                "agent_label": agent.get("label"),
                "agent_status": agent.get("status"),
                "response_time_ms": agent.get("response_time_ms"),
                "bot_detected": agent.get("bot_detected"),
                "detection_signal": agent.get("detection_signal"),
                "variables": agent.get("variables") or {},
                "network_tier": agent.get("network_tier"),
                "proxy_type": agent.get("proxy_type"),
                "native_price": agent.get("native_price") or evidence.get("native_price"),
                "native_currency": native_currency,
                "normalized_price_usd": agent.get("normalized_price_usd") or evidence.get("normalized_price_usd"),
                "fx_rate_used": agent.get("fx_rate_used") or evidence.get("fx_rate_used"),
                "browser_language": agent.get("browser_language") or evidence.get("browser_language"),
                "accept_language_header": agent.get("accept_language_header") or evidence.get("accept_language_header"),
                "language_label": agent.get("language_label") or evidence.get("language_label"),
                "extraction_evidence": evidence,
            }),
            "extraction_method": evidence.get("extraction_method") or "probe_engine",
        })
    return observations


def _parse_csv(csv_text: str) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    if not csv_text or not csv_text.strip():
        return [], [{"row": 0, "message": "CSV text is empty."}]
    try:
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        rows = [dict(row) for row in reader]
    except csv.Error as exc:
        return [], [{"row": 0, "message": f"CSV parse error: {exc}"}]
    if not reader.fieldnames:
        return [], [{"row": 0, "message": "CSV header row is missing."}]
    return rows, errors


def _row_value(row: dict[str, Any], *keys: str, default: str = "") -> str:
    lowered = {str(k).strip().lower(): v for k, v in row.items()}
    for key in keys:
        if key.lower() in lowered:
            return _clean(lowered[key.lower()], default)
    return default


def _build_portfolio(workspace: dict[str, Any]) -> list[dict[str, Any]]:
    products = {p["id"]: p for p in workspace["products"]}
    sellers = {s["id"]: s for s in workspace["sellers"]}
    findings_by_item: dict[str, dict[str, Any]] = {}
    for finding in sorted(workspace["findings"], key=lambda f: f.get("created_at", ""), reverse=True):
        item_id = finding.get("watchlist_item_id")
        if item_id and item_id not in findings_by_item:
            findings_by_item[item_id] = finding

    rows = []
    for item in workspace["watchlist_items"]:
        product = products.get(item.get("product_id"), {})
        seller = sellers.get(item.get("seller_id"), {})
        finding = findings_by_item.get(item["id"])
        status = "clear"
        if finding:
            status = "finding"
        elif item.get("last_observed_price") is None:
            status = "auditing"
        rows.append({
            "id": item["id"],
            "product": product.get("name", "Unknown product"),
            "sku": product.get("sku", "UNKNOWN"),
            "seller": seller.get("name", "Unknown seller"),
            "domain": seller.get("domain") or _domain_from_url(item.get("target_url", "")),
            "url": item.get("target_url", ""),
            "market": item.get("market") or "Global",
            "cadence": item.get("cadence") or "Manual",
            "lastAudit": item.get("updated_at") or item.get("created_at") or _now(),
            "lastStatus": status,
            "latestSeverity": finding.get("severity") if finding else None,
            "latestSpreadPct": finding.get("spread_pct") if finding else None,
            "findingId": finding.get("id") if finding else None,
        })
    return rows


def _build_findings(workspace: dict[str, Any]) -> list[dict[str, Any]]:
    products = {p["id"]: p for p in workspace["products"]}
    sellers = {s["id"]: s for s in workspace["sellers"]}
    items = {i["id"]: i for i in workspace["watchlist_items"]}
    evidence_by_finding: dict[str, list[dict[str, Any]]] = {}
    for evidence in workspace["evidence_items"]:
        evidence_by_finding.setdefault(evidence.get("finding_id"), []).append(evidence)

    rows = []
    for finding in sorted(workspace["findings"], key=lambda f: f.get("created_at", ""), reverse=True):
        product = products.get(finding.get("product_id"), {})
        seller = sellers.get(finding.get("seller_id"), {})
        item = items.get(finding.get("watchlist_item_id"), {})
        observed = _num(finding.get("observed_price")) or 0
        floor = _num(finding.get("map_floor")) or observed
        evidence_rows = evidence_by_finding.get(finding["id"], [])
        agents = [
            {
                "id": f"E{idx:02d}",
                "context": evidence.get("buyer_context") or "Imported observation",
                "geo": evidence.get("metadata", {}).get("market") or item.get("market") or "Unknown",
                "device": evidence.get("metadata", {}).get("device") or "Unspecified",
                "network": evidence.get("metadata", {}).get("network") or "manual",
                "referrer": evidence.get("metadata", {}).get("referrer") or "import",
                "price": _num(evidence.get("observed_price")),
                "status": "ok",
            }
            for idx, evidence in enumerate(evidence_rows)
        ]
        if not agents:
            agents = [{
                "id": "E00",
                "context": "Imported observation",
                "geo": item.get("market") or "Unknown",
                "device": "Unspecified",
                "network": "manual",
                "referrer": "import",
                "price": observed,
                "status": "ok",
            }]

        rows.append({
            "id": finding["id"],
            "product": product.get("name", "Unknown product"),
            "sku": product.get("sku", "UNKNOWN"),
            "seller": seller.get("name", "Unknown seller"),
            "domain": seller.get("domain") or _domain_from_url(item.get("target_url", "")),
            "url": item.get("target_url", ""),
            "market": item.get("market") or "Global",
            "type": "map" if finding.get("type") == "MAP_UNDERCUT" else "surveillance",
            "severity": finding.get("severity", "low"),
            "status": finding.get("status", "new"),
            "currency": finding.get("currency") or product.get("currency") or "USD",
            "observedLow": observed,
            "observedHigh": max(observed, floor),
            "baseline": floor,
            "mapFloor": floor,
            "spreadPct": _num(finding.get("spread_pct")) or 0,
            "driver": "Effective price below MAP floor",
            "confidence": finding.get("confidence", "medium"),
            "topology": "selective",
            "variationIndex": min(100, int(round((_num(finding.get("spread_pct")) or 0) * 5))),
            "detectedAt": finding.get("created_at") or _now(),
            "excerpt": finding.get("evidence_summary") or "MAP policy observation requires review.",
            "agents": agents,
        })
    return rows


def _build_kpis(workspace: dict[str, Any]) -> dict[str, Any]:
    findings = workspace["findings"]
    open_findings = [f for f in findings if f.get("status") != "resolved"]
    high_confidence = [f for f in findings if f.get("confidence") == "high"]
    return {
        "openFindings": len(open_findings),
        "critical": len([f for f in findings if f.get("severity") == "critical"]),
        "high": len([f for f in findings if f.get("severity") == "high"]),
        "monitoredUrls": len(workspace["watchlist_items"]),
        "highConfidencePct": round((len(high_confidence) / len(findings)) * 100) if findings else 0,
        "auditsThisMonth": len(workspace["scan_jobs"]),
    }


def _serialize_workspace(workspace: dict[str, Any], mode: str) -> dict[str, Any]:
    return {
        "mode": mode,
        "organization": workspace["organization"],
        "members": workspace.get("members", []),
        "invites": workspace.get("invites", []),
        "watchlists": workspace["watchlists"],
        "products": workspace["products"],
        "sellers": workspace["sellers"],
        "watchlist_items": workspace["watchlist_items"],
        "scan_jobs": workspace["scan_jobs"],
        "findings_raw": workspace["findings"],
        "evidence_items": workspace["evidence_items"],
        "evidence_exports": workspace.get("evidence_exports", []),
        "share_tokens": workspace.get("share_tokens", []),
        "audit_log": workspace["audit_log"][-50:],
        "portfolio": _build_portfolio(workspace),
        "findings": _build_findings(workspace),
        "kpis": _build_kpis(workspace),
    }


def _create_watchlist_memory(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    workspace = _workspace_for_user(user_id)
    _require_memory_permission(workspace, user_id, "watchlist.write")
    watchlist = {
        "id": _id(),
        "organization_id": workspace["organization"]["id"],
        "name": _clean(payload.get("name"), "MAP Pilot Watchlist"),
        "workflow_type": _normalize_workflow(payload.get("workflow_type")),
        "cadence": _normalize_cadence(payload.get("cadence")),
        "active": bool(payload.get("active", True)),
        "created_by": user_id,
        "created_at": _now(),
        "updated_at": _now(),
    }
    workspace["watchlists"].append(watchlist)
    _record_audit(workspace, user_id, "watchlist.created", "watchlist", watchlist["id"])
    response = _serialize_workspace(workspace, "memory")
    response["created_watchlist"] = watchlist
    return response


def _import_items_memory(user_id: str, watchlist_id: str, csv_text: str) -> dict[str, Any]:
    workspace = _workspace_for_user(user_id)
    _require_memory_permission(workspace, user_id, "watchlist.write")
    watchlist = _find_one(workspace["watchlists"], id=watchlist_id)
    if not watchlist:
        raise EnterpriseAccessError("Watchlist not found")

    rows, errors = _parse_csv(csv_text)
    imported = 0
    for idx, row in enumerate(rows, start=2):
        product_name = _row_value(row, "product_name", "product", "name")
        sku = _row_value(row, "sku")
        target_url = _row_value(row, "target_url", "url")
        seller_name = _row_value(row, "seller_name", "seller")
        seller_domain = _row_value(row, "seller_domain", "domain") or _domain_from_url(target_url)
        map_floor = _num(_row_value(row, "map_floor"))
        currency = _row_value(row, "currency", default="USD").upper()

        missing = [
            label for label, value in (
                ("product_name", product_name),
                ("sku", sku),
                ("target_url", target_url),
                ("seller_name", seller_name),
                ("map_floor", map_floor),
            )
            if value in (None, "")
        ]
        if missing:
            errors.append({"row": idx, "message": f"Missing required fields: {', '.join(missing)}"})
            continue
        if not _safe_import_url_shape(target_url):
            errors.append({"row": idx, "message": "target_url must be a public http(s) URL."})
            continue

        product = _find_one(workspace["products"], sku=sku)
        if not product:
            product = {
                "id": _id(),
                "organization_id": workspace["organization"]["id"],
                "sku": sku,
                "name": product_name,
                "category": _row_value(row, "category") or None,
                "canonical_url": _row_value(row, "canonical_url") or None,
                "map_floor": map_floor,
                "currency": currency,
                "active": True,
                "created_at": _now(),
                "updated_at": _now(),
            }
            workspace["products"].append(product)
        else:
            product.update({"name": product_name, "map_floor": map_floor, "currency": currency, "updated_at": _now()})

        seller = _find_one(workspace["sellers"], domain=seller_domain)
        if not seller:
            seller = {
                "id": _id(),
                "organization_id": workspace["organization"]["id"],
                "name": seller_name,
                "domain": seller_domain,
                "authorization_status": _normalize_auth_status(_row_value(row, "authorization_status")),
                "notes": None,
                "created_at": _now(),
                "updated_at": _now(),
            }
            workspace["sellers"].append(seller)

        item = _find_one(workspace["watchlist_items"], watchlist_id=watchlist_id, target_url=target_url)
        item_data = {
            "watchlist_id": watchlist_id,
            "product_id": product["id"],
            "seller_id": seller["id"],
            "target_url": target_url,
            "market": _row_value(row, "market", default="Global"),
            "status": "active",
            "last_observed_price": _num(_row_value(row, "observed_price", "effective_price")),
            "last_observed_currency": _row_value(row, "observed_currency", default=currency).upper(),
            "last_coverage_pct": _num(_row_value(row, "coverage_pct", "coverage")),
            "cadence": watchlist["cadence"].capitalize(),
            "updated_at": _now(),
        }
        if item:
            item.update(item_data)
        else:
            item = {"id": _id(), "created_at": _now(), **item_data}
            workspace["watchlist_items"].append(item)
        imported += 1

    _record_audit(workspace, user_id, "watchlist.items_imported", "watchlist", watchlist_id, {"imported": imported, "errors": len(errors)})
    return {"imported": imported, "errors": errors, "workspace": _serialize_workspace(workspace, "memory")}


def _launch_scan_memory(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    workspace = _workspace_for_user(user_id)
    _require_memory_permission(workspace, user_id, "scan.write")
    watchlist_id = _clean(payload.get("watchlist_id"))
    watchlist = _find_one(workspace["watchlists"], id=watchlist_id)
    if not watchlist:
        raise EnterpriseAccessError("Watchlist not found")

    limit = int(payload.get("limit") or 50)
    items = [item for item in workspace["watchlist_items"] if item.get("watchlist_id") == watchlist_id and item.get("status") == "active"][:limit]
    run_mode = _normalize_scan_mode(payload.get("run_mode"))
    audit_depth = _clean(payload.get("audit_depth"), "smart24")
    _enforce_scan_controls(workspace["organization"]["id"], user_id, run_mode, audit_depth, len(items), limit)
    if run_mode == "live":
        in_flight = next(
            (j for j in workspace["scan_jobs"]
             if j.get("watchlist_id") == watchlist_id
             and _scan_metadata(j).get("run_mode") == "live"
             and j.get("status") in ("queued", "running")),
            None,
        )
        if in_flight:
            # Idempotent: a double-submit returns the in-flight job instead of
            # queuing a second scan (and a second BrightData fan-out).
            return {"scan_job": in_flight, "findings": [], "workspace": _serialize_workspace(workspace, "memory"), "idempotent": True}
        month_start = _month_start_iso()
        mtd_cost = sum(
            _job_cost(j) for j in workspace["scan_jobs"]
            if (j.get("queued_at") or "") >= month_start and _scan_metadata(j).get("run_mode") == "live"
        )
        _assert_monthly_budget(mtd_cost, audit_depth, len(items))
        job = {
            "id": _id(),
            "organization_id": workspace["organization"]["id"],
            "watchlist_id": watchlist_id,
            "requested_by": user_id,
            "audit_depth": audit_depth,
            "status": "queued" if items else "completed",
            "target_count": len(items),
            "completed_count": 0,
            "failed_count": 0,
            "queued_at": _now(),
            "started_at": None,
            "completed_at": _now() if not items else None,
            "metadata": {
                "source": "live_probe",
                "run_mode": "live",
                "item_ids": [item["id"] for item in items],
                **({"reason": "No active watchlist items."} if not items else {}),
            },
        }
        workspace["scan_jobs"].append(job)
        _record_audit(workspace, user_id, "scan_job.queued", "scan_job", job["id"], {"targets": len(items), "run_mode": "live"})
        return {"scan_job": job, "findings": [], "workspace": _serialize_workspace(workspace, "memory")}

    job = {
        "id": _id(),
        "organization_id": workspace["organization"]["id"],
        "watchlist_id": watchlist_id,
        "requested_by": user_id,
        "audit_depth": audit_depth,
        "status": "running",
        "target_count": len(items),
        "completed_count": 0,
        "failed_count": 0,
        "queued_at": _now(),
        "started_at": _now(),
        "completed_at": None,
        "metadata": {"source": "csv_policy_preview", "run_mode": "imported", "item_ids": [item["id"] for item in items]},
    }
    workspace["scan_jobs"].append(job)

    products = {p["id"]: p for p in workspace["products"]}
    sellers = {s["id"]: s for s in workspace["sellers"]}
    created_findings = []
    for item in items:
        product = products.get(item["product_id"], {})
        seller = sellers.get(item.get("seller_id"), {})
        if item.get("last_observed_price") is None:
            job["failed_count"] += 1
            continue
        job["completed_count"] += 1
        result = evaluate_map_observation(
            product_name=product.get("name", "Unknown product"),
            sku=product.get("sku", "UNKNOWN"),
            seller_name=seller.get("name", "Unknown seller"),
            target_url=item.get("target_url", ""),
            observed_price=item.get("last_observed_price"),
            map_floor=product.get("map_floor"),
            currency=item.get("last_observed_currency") or product.get("currency") or "USD",
            coverage_pct=item.get("last_coverage_pct"),
        )
        if not result.get("is_violation"):
            continue
        finding = {
            "id": _id(),
            "organization_id": workspace["organization"]["id"],
            "scan_job_id": job["id"],
            "watchlist_item_id": item["id"],
            "product_id": product.get("id"),
            "seller_id": seller.get("id"),
            "type": result["type"],
            "severity": result["severity"],
            "status": "new",
            "observed_price": result["observed_price"],
            "map_floor": result["map_floor"],
            "currency": result["currency"],
            "spread_pct": result["spread_pct"],
            "confidence": result["confidence"],
            "evidence_summary": result["evidence_summary"],
            "created_at": _now(),
            "updated_at": _now(),
        }
        workspace["findings"].append(finding)
        workspace["evidence_items"].append({
            "id": _id(),
            "organization_id": workspace["organization"]["id"],
            "finding_id": finding["id"],
            "scan_job_id": job["id"],
            "probe_session_id": None,
            "buyer_context": "Imported effective price",
            "target_url": item["target_url"],
            "observed_price": result["observed_price"],
            "currency": result["currency"],
            "captured_at": _now(),
            "source": "csv_import",
            "extraction_method": "manual_observation",
            "metadata": {"market": item.get("market"), "coverage_pct": item.get("last_coverage_pct")},
        })
        created_findings.append(finding)

    job["status"] = "completed"
    job["completed_at"] = _now()
    if not job["completed_count"]:
        job["metadata"]["reason"] = "No imported observed prices. Run a live scan to collect observations."
    _record_audit(workspace, user_id, "scan_job.created", "scan_job", job["id"], {"findings": len(created_findings)})
    return {"scan_job": job, "findings": created_findings, "workspace": _serialize_workspace(workspace, "memory")}


async def _ensure_supabase_org(client, user_id: str, org_id: Optional[str] = None) -> dict[str, Any]:
    def work():
        memberships = client.table("organization_members").select("organization_id,role").eq("user_id", user_id).execute().data or []
        allowed_org_ids = {m["organization_id"] for m in memberships}
        if org_id:
            if org_id not in allowed_org_ids:
                raise EnterpriseAccessError("Organization not found")
            org_rows = client.table("organizations").select("*").eq("id", org_id).limit(1).execute().data or []
            if not org_rows:
                raise EnterpriseAccessError("Organization not found")
            return org_rows[0]
        if memberships:
            first_org = memberships[0]["organization_id"]
            org_rows = client.table("organizations").select("*").eq("id", first_org).limit(1).execute().data or []
            if org_rows:
                return org_rows[0]

        org = client.table("organizations").insert({"name": DEFAULT_WORKSPACE_NAME, "created_by": user_id}).execute().data[0]
        client.table("organization_members").insert({"organization_id": org["id"], "user_id": user_id, "role": "owner"}).execute()
        return org

    return await _thread(work)


async def _workspace_supabase(client, user_id: str) -> dict[str, Any]:
    org = await _ensure_supabase_org(client, user_id)

    def work():
        org_id = org["id"]
        watchlists = client.table("watchlists").select("*").eq("organization_id", org_id).order("created_at", desc=True).execute().data or []
        products = client.table("products").select("*").eq("organization_id", org_id).order("created_at", desc=True).execute().data or []
        sellers = client.table("sellers").select("*").eq("organization_id", org_id).order("created_at", desc=True).execute().data or []
        members = client.table("organization_members").select("id,organization_id,user_id,role,created_at").eq("organization_id", org_id).order("created_at", desc=True).execute().data or []
        try:
            invites = client.table("organization_invites").select("id,organization_id,email,role,expires_at,accepted_at,revoked_at,created_by,created_at").eq("organization_id", org_id).order("created_at", desc=True).limit(100).execute().data or []
        except Exception:
            invites = []
        watchlist_ids = [w["id"] for w in watchlists]
        items = []
        if watchlist_ids:
            items = client.table("watchlist_items").select("*").in_("watchlist_id", watchlist_ids).order("created_at", desc=True).execute().data or []
        scan_jobs = client.table("scan_jobs").select("*").eq("organization_id", org_id).order("queued_at", desc=True).limit(25).execute().data or []
        findings = client.table("findings").select("*").eq("organization_id", org_id).order("created_at", desc=True).limit(100).execute().data or []
        evidence_items = client.table("evidence_items").select("*").eq("organization_id", org_id).order("captured_at", desc=True).limit(250).execute().data or []
        evidence_exports = client.table("evidence_exports").select("*").eq("organization_id", org_id).order("created_at", desc=True).limit(100).execute().data or []
        share_tokens = client.table("share_tokens").select("id,organization_id,finding_id,scope,expires_at,revoked_at,created_by,created_at").eq("organization_id", org_id).order("created_at", desc=True).limit(100).execute().data or []
        audit_log = client.table("audit_log").select("*").eq("organization_id", org_id).order("created_at", desc=True).limit(50).execute().data or []
        for item in items:
            wl = next((w for w in watchlists if w["id"] == item.get("watchlist_id")), None)
            item["cadence"] = (wl or {}).get("cadence", "manual").capitalize()
        return {
            "organization": org,
            "members": members,
            "invites": invites,
            "watchlists": watchlists,
            "products": products,
            "sellers": sellers,
            "watchlist_items": items,
            "scan_jobs": scan_jobs,
            "findings": findings,
            "evidence_items": evidence_items,
            "evidence_exports": evidence_exports,
            "share_tokens": share_tokens,
            "audit_log": audit_log,
        }

    return _serialize_workspace(await _thread(work), "supabase")


async def get_workspace(user_id: str) -> dict[str, Any]:
    client = _store_client()
    if client:
        return await _workspace_supabase(client, user_id)
    return _serialize_workspace(_workspace_for_user(user_id), "memory")


async def create_watchlist(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    client = _store_client()
    if not client:
        return _create_watchlist_memory(user_id, payload)

    org = await _ensure_supabase_org(client, user_id, payload.get("org_id"))

    def work():
        require_permission(_supabase_membership_role(client, org["id"], user_id), "watchlist.write")
        watchlist = client.table("watchlists").insert({
            "organization_id": org["id"],
            "name": _clean(payload.get("name"), "MAP Pilot Watchlist"),
            "workflow_type": _normalize_workflow(payload.get("workflow_type")),
            "cadence": _normalize_cadence(payload.get("cadence")),
            "active": bool(payload.get("active", True)),
            "created_by": user_id,
        }).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": org["id"],
            "actor_user_id": user_id,
            "action": "watchlist.created",
            "entity_type": "watchlist",
            "entity_id": watchlist["id"],
        }).execute()
        return watchlist

    watchlist = await _thread(work)
    response = await _workspace_supabase(client, user_id)
    response["created_watchlist"] = watchlist
    return response


async def import_watchlist_items(user_id: str, watchlist_id: str, csv_text: str) -> dict[str, Any]:
    client = _store_client()
    if not client:
        return _import_items_memory(user_id, watchlist_id, csv_text)

    rows, errors = _parse_csv(csv_text)

    def work():
        watchlists = client.table("watchlists").select("*").eq("id", watchlist_id).limit(1).execute().data or []
        if not watchlists:
            raise EnterpriseAccessError("Watchlist not found")
        watchlist = watchlists[0]
        org_id = watchlist["organization_id"]
        require_permission(_supabase_membership_role(client, org_id, user_id), "watchlist.write")

        imported = 0
        for idx, row in enumerate(rows, start=2):
            product_name = _row_value(row, "product_name", "product", "name")
            sku = _row_value(row, "sku")
            target_url = _row_value(row, "target_url", "url")
            seller_name = _row_value(row, "seller_name", "seller")
            seller_domain = _row_value(row, "seller_domain", "domain") or _domain_from_url(target_url)
            map_floor = _num(_row_value(row, "map_floor"))
            currency = _row_value(row, "currency", default="USD").upper()
            missing = [
                label for label, value in (
                    ("product_name", product_name),
                    ("sku", sku),
                    ("target_url", target_url),
                    ("seller_name", seller_name),
                    ("map_floor", map_floor),
                )
                if value in (None, "")
            ]
            if missing:
                errors.append({"row": idx, "message": f"Missing required fields: {', '.join(missing)}"})
                continue
            if not _safe_import_url_shape(target_url):
                errors.append({"row": idx, "message": "target_url must be a public http(s) URL."})
                continue

            product = client.table("products").upsert({
                "organization_id": org_id,
                "sku": sku,
                "name": product_name,
                "category": _row_value(row, "category") or None,
                "canonical_url": _row_value(row, "canonical_url") or None,
                "map_floor": map_floor,
                "currency": currency,
                "active": True,
            }, on_conflict="organization_id,sku").execute().data[0]
            seller = client.table("sellers").upsert({
                "organization_id": org_id,
                "name": seller_name,
                "domain": seller_domain,
                "authorization_status": _normalize_auth_status(_row_value(row, "authorization_status")),
            }, on_conflict="organization_id,domain").execute().data[0]
            client.table("watchlist_items").upsert({
                "watchlist_id": watchlist_id,
                "product_id": product["id"],
                "seller_id": seller["id"],
                "target_url": target_url,
                "market": _row_value(row, "market", default="Global"),
                "status": "active",
                "last_observed_price": _num(_row_value(row, "observed_price", "effective_price")),
                "last_observed_currency": _row_value(row, "observed_currency", default=currency).upper(),
                "last_coverage_pct": _num(_row_value(row, "coverage_pct", "coverage")),
            }, on_conflict="watchlist_id,target_url").execute()
            imported += 1

        client.table("audit_log").insert({
            "organization_id": org_id,
            "actor_user_id": user_id,
            "action": "watchlist.items_imported",
            "entity_type": "watchlist",
            "entity_id": watchlist_id,
            "metadata": {"imported": imported, "errors": len(errors)},
        }).execute()
        return imported

    imported = await _thread(work)
    return {"imported": imported, "errors": errors, "workspace": await _workspace_supabase(client, user_id)}


async def launch_scan_job(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    client = _store_client()
    if not client:
        return _launch_scan_memory(user_id, payload)

    def work():
        watchlist_id = _clean(payload.get("watchlist_id"))
        watchlists = client.table("watchlists").select("*").eq("id", watchlist_id).limit(1).execute().data or []
        if not watchlists:
            raise EnterpriseAccessError("Watchlist not found")
        watchlist = watchlists[0]
        org_id = watchlist["organization_id"]
        require_permission(_supabase_membership_role(client, org_id, user_id), "scan.write")
        limit = int(payload.get("limit") or 50)
        items = client.table("watchlist_items").select("*").eq("watchlist_id", watchlist_id).eq("status", "active").limit(limit).execute().data or []
        run_mode = _normalize_scan_mode(payload.get("run_mode"))
        audit_depth = _clean(payload.get("audit_depth"), "smart24")
        _enforce_scan_controls(org_id, user_id, run_mode, audit_depth, len(items), limit)
        if run_mode == "live":
            in_flight = [
                j for j in (
                    client.table("scan_jobs").select("*")
                    .eq("organization_id", org_id).eq("watchlist_id", watchlist_id)
                    .in_("status", ["queued", "running"])
                    .order("queued_at", desc=True).limit(5).execute().data or []
                )
                if (j.get("metadata") or {}).get("run_mode") == "live"
            ]
            if in_flight:
                # Idempotent: a double-submit returns the in-flight job instead
                # of queuing a second scan (and a second BrightData fan-out).
                return {"scan_job": in_flight[0], "findings": [], "idempotent": True}
            month_start = _month_start_iso()
            prior = client.table("scan_jobs").select("audit_depth,target_count,status,metadata").eq("organization_id", org_id).gte("queued_at", month_start).execute().data or []
            mtd_cost = sum(_job_cost(j) for j in prior if (j.get("metadata") or {}).get("run_mode") == "live")
            _assert_monthly_budget(mtd_cost, audit_depth, len(items))
            metadata = {
                "source": "live_probe",
                "run_mode": "live",
                "item_ids": [item["id"] for item in items],
            }
            if not items:
                metadata["reason"] = "No active watchlist items."
            job = client.table("scan_jobs").insert({
                "organization_id": org_id,
                "watchlist_id": watchlist_id,
                "requested_by": user_id,
                "audit_depth": audit_depth,
                "status": "queued" if items else "completed",
                "target_count": len(items),
                "completed_at": _now() if not items else None,
                "metadata": metadata,
            }).execute().data[0]
            client.table("audit_log").insert({
                "organization_id": org_id,
                "actor_user_id": user_id,
                "action": "scan_job.queued",
                "entity_type": "scan_job",
                "entity_id": job["id"],
                "metadata": {"targets": len(items), "run_mode": "live"},
            }).execute()
            return {"scan_job": job, "findings": []}

        job = client.table("scan_jobs").insert({
            "organization_id": org_id,
            "watchlist_id": watchlist_id,
            "requested_by": user_id,
            "audit_depth": audit_depth,
            "status": "running",
            "target_count": len(items),
            "started_at": _now(),
            "metadata": {"source": "csv_policy_preview", "run_mode": "imported", "item_ids": [item["id"] for item in items]},
        }).execute().data[0]

        product_ids = list({i["product_id"] for i in items if i.get("product_id")})
        seller_ids = list({i["seller_id"] for i in items if i.get("seller_id")})
        products = {}
        sellers = {}
        if product_ids:
            products = {p["id"]: p for p in (client.table("products").select("*").in_("id", product_ids).execute().data or [])}
        if seller_ids:
            sellers = {s["id"]: s for s in (client.table("sellers").select("*").in_("id", seller_ids).execute().data or [])}

        completed = 0
        failed = 0
        created_findings = []
        for item in items:
            product = products.get(item.get("product_id"), {})
            seller = sellers.get(item.get("seller_id"), {})
            if item.get("last_observed_price") is None:
                failed += 1
                continue
            completed += 1
            result = evaluate_map_observation(
                product_name=product.get("name", "Unknown product"),
                sku=product.get("sku", "UNKNOWN"),
                seller_name=seller.get("name", "Unknown seller"),
                target_url=item.get("target_url", ""),
                observed_price=item.get("last_observed_price"),
                map_floor=product.get("map_floor"),
                currency=item.get("last_observed_currency") or product.get("currency") or "USD",
                coverage_pct=item.get("last_coverage_pct"),
            )
            if not result.get("is_violation"):
                continue
            finding = client.table("findings").insert({
                "organization_id": org_id,
                "scan_job_id": job["id"],
                "watchlist_item_id": item["id"],
                "product_id": product.get("id"),
                "seller_id": seller.get("id"),
                "type": result["type"],
                "severity": result["severity"],
                "status": "new",
                "observed_price": result["observed_price"],
                "map_floor": result["map_floor"],
                "currency": result["currency"],
                "spread_pct": result["spread_pct"],
                "confidence": result["confidence"],
                "evidence_summary": result["evidence_summary"],
            }).execute().data[0]
            client.table("evidence_items").insert({
                "organization_id": org_id,
                "finding_id": finding["id"],
                "scan_job_id": job["id"],
                "target_url": item["target_url"],
                "buyer_context": "Imported effective price",
                "observed_price": result["observed_price"],
                "currency": result["currency"],
                "source": "csv_import",
                "extraction_method": "manual_observation",
                "metadata": {"market": item.get("market"), "coverage_pct": item.get("last_coverage_pct")},
            }).execute()
            created_findings.append(finding)

        status = "completed"
        metadata = {"source": "csv_policy_preview", "run_mode": "imported", "item_ids": [item["id"] for item in items]}
        if not completed:
            metadata["reason"] = "No imported observed prices. Run a live scan to collect observations."
        client.table("scan_jobs").update({
            "status": status,
            "completed_count": completed,
            "failed_count": failed,
            "completed_at": _now(),
            "metadata": metadata,
        }).eq("id", job["id"]).execute()
        job.update({"status": status, "completed_count": completed, "failed_count": failed, "metadata": metadata})
        client.table("audit_log").insert({
            "organization_id": org_id,
            "actor_user_id": user_id,
            "action": "scan_job.created",
            "entity_type": "scan_job",
            "entity_id": job["id"],
            "metadata": {"findings": len(created_findings)},
        }).execute()
        return {"scan_job": job, "findings": created_findings}

    result = await _thread(work)
    result["workspace"] = await _workspace_supabase(client, user_id)
    return result


def _memory_scan_work(user_id: str, scan_job_id: str) -> dict[str, Any]:
    workspace = _workspace_for_user(user_id)
    job = _find_one(workspace["scan_jobs"], id=scan_job_id)
    if not job:
        raise EnterpriseAccessError("Scan job not found")
    item_ids = set(_scan_item_ids(job))
    items = [
        item for item in workspace["watchlist_items"]
        if item.get("watchlist_id") == job.get("watchlist_id")
        and item.get("status") == "active"
        and (not item_ids or item.get("id") in item_ids)
    ]
    products = {p["id"]: p for p in workspace["products"]}
    sellers = {s["id"]: s for s in workspace["sellers"]}
    return {
        "scan_job": job,
        "items": [
            {
                "item": item,
                "product": products.get(item.get("product_id"), {}),
                "seller": sellers.get(item.get("seller_id"), {}),
            }
            for item in items
        ],
    }


async def get_scan_job_work(user_id: str, scan_job_id: str) -> dict[str, Any]:
    """Load the queued job and its exact target set for a live worker run."""
    client = _store_client()
    if not client:
        return _memory_scan_work(user_id, scan_job_id)

    def work():
        jobs = client.table("scan_jobs").select("*").eq("id", scan_job_id).limit(1).execute().data or []
        if not jobs:
            raise EnterpriseAccessError("Scan job not found")
        job = jobs[0]
        memberships = client.table("organization_members").select("id").eq("organization_id", job["organization_id"]).eq("user_id", user_id).limit(1).execute().data or []
        if not memberships:
            raise EnterpriseAccessError("Scan job not found")

        item_ids = _scan_item_ids(job)
        item_query = client.table("watchlist_items").select("*").eq("watchlist_id", job["watchlist_id"]).eq("status", "active")
        if item_ids:
            item_query = item_query.in_("id", item_ids)
        items = item_query.execute().data or []
        if item_ids:
            by_id = {item["id"]: item for item in items}
            items = [by_id[item_id] for item_id in item_ids if item_id in by_id]

        product_ids = list({item["product_id"] for item in items if item.get("product_id")})
        seller_ids = list({item["seller_id"] for item in items if item.get("seller_id")})
        products = {}
        sellers = {}
        if product_ids:
            products = {p["id"]: p for p in (client.table("products").select("*").in_("id", product_ids).execute().data or [])}
        if seller_ids:
            sellers = {s["id"]: s for s in (client.table("sellers").select("*").in_("id", seller_ids).execute().data or [])}
        return {
            "scan_job": job,
            "items": [
                {
                    "item": item,
                    "product": products.get(item.get("product_id"), {}),
                    "seller": sellers.get(item.get("seller_id"), {}),
                }
                for item in items
            ],
        }

    return await _thread(work)


async def claim_scan_job(user_id: str, scan_job_id: str) -> dict[str, Any]:
    """Move a queued live scan job to running if it has not been claimed."""
    client = _store_client()
    if not client:
        workspace = _workspace_for_user(user_id)
        job = _find_one(workspace["scan_jobs"], id=scan_job_id)
        if not job:
            raise EnterpriseAccessError("Scan job not found")
        if job.get("status") != "queued":
            return {"claimed": False, "scan_job": job}
        metadata = _scan_metadata(job)
        metadata["claimed_at"] = _now()
        job.update({"status": "running", "started_at": _now(), "metadata": metadata})
        _record_audit(workspace, user_id, "scan_job.claimed", "scan_job", job["id"])
        return {"claimed": True, "scan_job": job}

    def work():
        jobs = client.table("scan_jobs").select("*").eq("id", scan_job_id).limit(1).execute().data or []
        if not jobs:
            raise EnterpriseAccessError("Scan job not found")
        job = jobs[0]
        memberships = client.table("organization_members").select("id").eq("organization_id", job["organization_id"]).eq("user_id", user_id).limit(1).execute().data or []
        if not memberships:
            raise EnterpriseAccessError("Scan job not found")
        metadata = _scan_metadata(job)
        metadata["claimed_at"] = _now()
        updated = client.table("scan_jobs").update({
            "status": "running",
            "started_at": _now(),
            "metadata": metadata,
        }).eq("id", scan_job_id).eq("status", "queued").execute().data or []
        if not updated:
            current = client.table("scan_jobs").select("*").eq("id", scan_job_id).limit(1).execute().data[0]
            return {"claimed": False, "scan_job": current}
        client.table("audit_log").insert({
            "organization_id": job["organization_id"],
            "actor_user_id": user_id,
            "action": "scan_job.claimed",
            "entity_type": "scan_job",
            "entity_id": scan_job_id,
        }).execute()
        return {"claimed": True, "scan_job": updated[0]}

    return await _thread(work)


async def claim_next_scan_job(worker_id: str = "enterprise-worker") -> dict[str, Any]:
    """Claim the next queued live scan job across organizations.

    This is intentionally worker-scoped rather than user-scoped. It is used by
    the cron/durable worker endpoint, which runs with the service-role backend
    client and then processes the job as the original requester.
    """
    client = _store_client()
    now = _now()
    if not client:
        candidates: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
        for owner_id, workspace in _MEMORY_WORKSPACES.items():
            for job in workspace["scan_jobs"]:
                metadata = _scan_metadata(job)
                if job.get("status") == "queued" and metadata.get("run_mode") == "live":
                    candidates.append((job.get("queued_at") or "", workspace, {"owner_id": owner_id, **job}))
        if not candidates:
            # No queued work — reclaim a live job whose worker lease has lapsed.
            cutoff = (datetime.now(timezone.utc) - timedelta(seconds=ENTERPRISE_SCAN_LEASE_SECONDS)).isoformat()
            for owner_id, workspace in _MEMORY_WORKSPACES.items():
                for job in workspace["scan_jobs"]:
                    metadata = _scan_metadata(job)
                    if (job.get("status") == "running" and metadata.get("run_mode") == "live"
                            and (job.get("started_at") or "") < cutoff):
                        metadata.update({"claimed_at": now, "worker_id": worker_id, "reclaimed": True})
                        job.update({"started_at": now, "metadata": metadata})
                        _record_audit(workspace, owner_id, "scan_job.reclaimed", "scan_job", job["id"], {"worker_id": worker_id})
                        return {"claimed": True, "scan_job": job, "user_id": owner_id}
            return {"claimed": False, "scan_job": None, "user_id": None}
        _, workspace, job_with_owner = sorted(candidates, key=lambda row: row[0])[0]
        owner_id = job_with_owner.pop("owner_id")
        job = _find_one(workspace["scan_jobs"], id=job_with_owner["id"])
        if not job:
            return {"claimed": False, "scan_job": None, "user_id": None}
        metadata = _scan_metadata(job)
        metadata.update({"claimed_at": now, "worker_id": worker_id})
        job.update({"status": "running", "started_at": job.get("started_at") or now, "metadata": metadata})
        _record_audit(workspace, owner_id, "scan_job.claimed", "scan_job", job["id"], {"worker_id": worker_id})
        return {"claimed": True, "scan_job": job, "user_id": owner_id}

    def work():
        rows = client.table("scan_jobs").select("*").eq("status", "queued").order("queued_at").limit(25).execute().data or []
        for job in rows:
            metadata = _scan_metadata(job)
            if metadata.get("run_mode") != "live":
                continue
            metadata.update({"claimed_at": now, "worker_id": worker_id})
            updated = client.table("scan_jobs").update({
                "status": "running",
                "started_at": job.get("started_at") or now,
                "metadata": metadata,
            }).eq("id", job["id"]).eq("status", "queued").execute().data or []
            if not updated:
                continue
            claimed_job = updated[0]
            actor = claimed_job.get("requested_by")
            client.table("audit_log").insert({
                "organization_id": claimed_job["organization_id"],
                "actor_user_id": actor,
                "action": "scan_job.claimed",
                "entity_type": "scan_job",
                "entity_id": claimed_job["id"],
                "metadata": {"worker_id": worker_id},
            }).execute()
            return {"claimed": True, "scan_job": claimed_job, "user_id": actor}

        # No queued work — reclaim a live job whose worker lease has lapsed
        # (crashed/timed-out worker). Optimistic concurrency on started_at keeps
        # this race-safe across overlapping cron runs.
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=ENTERPRISE_SCAN_LEASE_SECONDS)).isoformat()
        stale = client.table("scan_jobs").select("*").eq("status", "running").lt("started_at", cutoff).order("started_at").limit(25).execute().data or []
        for job in stale:
            metadata = _scan_metadata(job)
            if metadata.get("run_mode") != "live":
                continue
            metadata.update({"claimed_at": now, "worker_id": worker_id, "reclaimed": True})
            updated = client.table("scan_jobs").update({
                "started_at": now,
                "metadata": metadata,
            }).eq("id", job["id"]).eq("status", "running").lt("started_at", cutoff).execute().data or []
            if not updated:
                continue
            claimed_job = updated[0]
            actor = claimed_job.get("requested_by")
            client.table("audit_log").insert({
                "organization_id": claimed_job["organization_id"],
                "actor_user_id": actor,
                "action": "scan_job.reclaimed",
                "entity_type": "scan_job",
                "entity_id": claimed_job["id"],
                "metadata": {"worker_id": worker_id},
            }).execute()
            return {"claimed": True, "scan_job": claimed_job, "user_id": actor}
        return {"claimed": False, "scan_job": None, "user_id": None}

    return await _thread(work)


async def release_scan_job(user_id: str, scan_job_id: str, reason: str = "partial_worker_slice") -> dict[str, Any]:
    """Return a partially processed live scan job to the queue."""
    client = _store_client()
    now = _now()
    if not client:
        workspace = _workspace_for_user(user_id)
        job = _find_one(workspace["scan_jobs"], id=scan_job_id)
        if not job:
            raise EnterpriseAccessError("Scan job not found")
        metadata = _scan_metadata(job)
        metadata.update({"released_at": now, "release_reason": reason})
        job.update({"status": "queued", "metadata": metadata})
        _record_audit(workspace, user_id, "scan_job.released", "scan_job", scan_job_id, {"reason": reason})
        return {"scan_job": job}

    def work():
        jobs = client.table("scan_jobs").select("*").eq("id", scan_job_id).limit(1).execute().data or []
        if not jobs:
            raise EnterpriseAccessError("Scan job not found")
        job = jobs[0]
        memberships = client.table("organization_members").select("id").eq("organization_id", job["organization_id"]).eq("user_id", user_id).limit(1).execute().data or []
        if not memberships:
            raise EnterpriseAccessError("Scan job not found")
        metadata = _scan_metadata(job)
        metadata.update({"released_at": now, "release_reason": reason})
        updated = client.table("scan_jobs").update({
            "status": "queued",
            "metadata": metadata,
        }).eq("id", scan_job_id).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": job["organization_id"],
            "actor_user_id": user_id,
            "action": "scan_job.released",
            "entity_type": "scan_job",
            "entity_id": scan_job_id,
            "metadata": {"reason": reason},
        }).execute()
        return {"scan_job": updated}

    return await _thread(work)


def _record_live_result_memory(
    user_id: str,
    scan_job_id: str,
    watchlist_item_id: str,
    session: dict[str, Any],
    probe_row_id: Optional[str],
    error: Optional[str],
) -> dict[str, Any]:
    workspace = _workspace_for_user(user_id)
    job = _find_one(workspace["scan_jobs"], id=scan_job_id)
    item = _find_one(workspace["watchlist_items"], id=watchlist_item_id)
    if not job or not item:
        raise EnterpriseAccessError("Scan target not found")

    metadata = _scan_metadata(job)
    processed = set(metadata.get("processed_item_ids") or [])
    if watchlist_item_id in processed:
        return {"scan_job": job, "finding": None, "evidence_items": [], "duplicate": True}

    product = _find_one(workspace["products"], id=item.get("product_id")) or {}
    seller = _find_one(workspace["sellers"], id=item.get("seller_id")) or {}
    currency = (product.get("currency") or item.get("last_observed_currency") or "USD").upper()
    observations = [] if error else extract_probe_observations(session, currency)
    coverage = _coverage_from_session(session)
    finding = None
    evidence_rows: list[dict[str, Any]] = []

    if observations:
        job["completed_count"] = int(job.get("completed_count") or 0) + 1
        low = min(observations, key=lambda obs: obs["observed_price"])
        item.update({
            "last_observed_price": low["observed_price"],
            "last_observed_currency": currency,
            "last_coverage_pct": coverage,
            "updated_at": _now(),
            "last_probe_session_id": session.get("session_id"),
            "last_scan_status": "completed",
        })
        result = evaluate_map_observation(
            product_name=product.get("name", "Unknown product"),
            sku=product.get("sku", "UNKNOWN"),
            seller_name=seller.get("name", "Unknown seller"),
            target_url=item.get("target_url", ""),
            observed_price=low["observed_price"],
            map_floor=product.get("map_floor"),
            currency=currency,
            coverage_pct=coverage,
        )
        if result.get("is_violation"):
            finding = {
                "id": _id(),
                "organization_id": workspace["organization"]["id"],
                "scan_job_id": job["id"],
                "watchlist_item_id": item["id"],
                "product_id": product.get("id"),
                "seller_id": seller.get("id"),
                "type": result["type"],
                "severity": result["severity"],
                "status": "new",
                "observed_price": result["observed_price"],
                "map_floor": result["map_floor"],
                "currency": result["currency"],
                "spread_pct": result["spread_pct"],
                "confidence": result["confidence"],
                "evidence_summary": result["evidence_summary"],
                "created_at": _now(),
                "updated_at": _now(),
            }
            workspace["findings"].append(finding)
            _record_audit(workspace, user_id, "finding.created", "finding", finding["id"], {"scan_job_id": scan_job_id})

        for observation in observations:
            row = {
                "id": _id(),
                "organization_id": workspace["organization"]["id"],
                "finding_id": finding["id"] if finding else None,
                "scan_job_id": scan_job_id,
                "probe_session_id": session.get("session_id"),
                "buyer_context": observation["buyer_context"],
                "target_url": item["target_url"],
                "observed_price": observation["observed_price"],
                "currency": observation["currency"],
                "captured_at": _now(),
                "source": "live_probe",
                "extraction_method": observation["extraction_method"],
                "metadata": {
                    **observation["metadata"],
                    "market": item.get("market"),
                    "coverage_pct": coverage,
                    "probe_row_id": probe_row_id,
                    "session_status": session.get("status"),
                },
            }
            workspace["evidence_items"].append(row)
            evidence_rows.append(row)
    else:
        job["failed_count"] = int(job.get("failed_count") or 0) + 1
        item.update({
            "last_coverage_pct": coverage,
            "updated_at": _now(),
            "last_probe_session_id": session.get("session_id"),
            "last_scan_status": "failed",
            "last_error": error or session.get("error") or "No observed price returned by the probe engine.",
        })
        errors = list(metadata.get("errors") or [])
        errors.append({
            "watchlist_item_id": watchlist_item_id,
            "target_url": item.get("target_url"),
            "session_id": session.get("session_id"),
            "message": item.get("last_error"),
        })
        metadata["errors"] = errors[-100:]

    processed.add(watchlist_item_id)
    metadata["processed_item_ids"] = sorted(processed)
    metadata["last_progress_at"] = _now()
    job["metadata"] = metadata
    _record_audit(workspace, user_id, "scan_job.target_recorded", "scan_job", scan_job_id, {
        "watchlist_item_id": watchlist_item_id,
        "evidence_items": len(evidence_rows),
        "finding_id": finding.get("id") if finding else None,
    })
    return {"scan_job": job, "finding": finding, "evidence_items": evidence_rows, "duplicate": False}


async def record_live_probe_result(
    user_id: str,
    scan_job_id: str,
    watchlist_item_id: str,
    session: dict[str, Any],
    probe_row_id: Optional[str] = None,
    error: Optional[str] = None,
) -> dict[str, Any]:
    """Persist one live probe session as evidence and, when warranted, a MAP finding."""
    client = _store_client()
    if not client:
        return _record_live_result_memory(user_id, scan_job_id, watchlist_item_id, session, probe_row_id, error)

    def work():
        jobs = client.table("scan_jobs").select("*").eq("id", scan_job_id).limit(1).execute().data or []
        items = client.table("watchlist_items").select("*").eq("id", watchlist_item_id).limit(1).execute().data or []
        if not jobs or not items:
            raise EnterpriseAccessError("Scan target not found")
        job = jobs[0]
        item = items[0]
        memberships = client.table("organization_members").select("id").eq("organization_id", job["organization_id"]).eq("user_id", user_id).limit(1).execute().data or []
        if not memberships:
            raise EnterpriseAccessError("Scan target not found")

        metadata = _scan_metadata(job)
        processed = set(metadata.get("processed_item_ids") or [])
        if watchlist_item_id in processed:
            return {"scan_job": job, "finding": None, "evidence_items": [], "duplicate": True}

        product_rows = client.table("products").select("*").eq("id", item["product_id"]).limit(1).execute().data or []
        seller_rows = client.table("sellers").select("*").eq("id", item["seller_id"]).limit(1).execute().data or [] if item.get("seller_id") else []
        product = product_rows[0] if product_rows else {}
        seller = seller_rows[0] if seller_rows else {}
        currency = (product.get("currency") or item.get("last_observed_currency") or "USD").upper()
        observations = [] if error else extract_probe_observations(session, currency)
        coverage = _coverage_from_session(session)
        finding = None
        evidence_rows: list[dict[str, Any]] = []
        completed = int(job.get("completed_count") or 0)
        failed = int(job.get("failed_count") or 0)

        if observations:
            completed += 1
            low = min(observations, key=lambda obs: obs["observed_price"])
            item_update = {
                "last_observed_price": low["observed_price"],
                "last_observed_currency": currency,
                "last_coverage_pct": coverage,
            }
            try:
                item_update.update({
                    "last_probe_session_id": session.get("session_id"),
                    "last_scan_job_id": scan_job_id,
                    "last_scan_status": "completed",
                    "last_error": None,
                })
                client.table("watchlist_items").update(item_update).eq("id", watchlist_item_id).execute()
            except Exception as exc:
                if "last_probe_session_id" not in str(exc) and "last_scan_job_id" not in str(exc) and "last_scan_status" not in str(exc):
                    raise
                for key in ("last_probe_session_id", "last_scan_job_id", "last_scan_status", "last_error"):
                    item_update.pop(key, None)
                client.table("watchlist_items").update(item_update).eq("id", watchlist_item_id).execute()

            result = evaluate_map_observation(
                product_name=product.get("name", "Unknown product"),
                sku=product.get("sku", "UNKNOWN"),
                seller_name=seller.get("name", "Unknown seller"),
                target_url=item.get("target_url", ""),
                observed_price=low["observed_price"],
                map_floor=product.get("map_floor"),
                currency=currency,
                coverage_pct=coverage,
            )
            if result.get("is_violation"):
                finding = client.table("findings").insert({
                    "organization_id": job["organization_id"],
                    "scan_job_id": scan_job_id,
                    "watchlist_item_id": watchlist_item_id,
                    "product_id": product.get("id"),
                    "seller_id": seller.get("id"),
                    "type": result["type"],
                    "severity": result["severity"],
                    "status": "new",
                    "observed_price": result["observed_price"],
                    "map_floor": result["map_floor"],
                    "currency": result["currency"],
                    "spread_pct": result["spread_pct"],
                    "confidence": result["confidence"],
                    "evidence_summary": result["evidence_summary"],
                }).execute().data[0]
                client.table("audit_log").insert({
                    "organization_id": job["organization_id"],
                    "actor_user_id": user_id,
                    "action": "finding.created",
                    "entity_type": "finding",
                    "entity_id": finding["id"],
                    "metadata": {"scan_job_id": scan_job_id},
                }).execute()

            evidence_rows = [
                {
                    "organization_id": job["organization_id"],
                    "finding_id": finding["id"] if finding else None,
                    "scan_job_id": scan_job_id,
                    "probe_session_id": session.get("session_id"),
                    "buyer_context": observation["buyer_context"],
                    "target_url": item["target_url"],
                    "observed_price": observation["observed_price"],
                    "currency": observation["currency"],
                    "source": "live_probe",
                    "extraction_method": observation["extraction_method"],
                    "metadata": {
                        **observation["metadata"],
                        "market": item.get("market"),
                        "coverage_pct": coverage,
                        "probe_row_id": probe_row_id,
                        "session_status": session.get("status"),
                    },
                }
                for observation in observations
            ]
            if evidence_rows:
                evidence_rows = client.table("evidence_items").insert(evidence_rows).execute().data or []
        else:
            failed += 1
            message = error or session.get("error") or "No observed price returned by the probe engine."
            item_update = {"last_coverage_pct": coverage}
            try:
                item_update.update({
                    "last_probe_session_id": session.get("session_id"),
                    "last_scan_job_id": scan_job_id,
                    "last_scan_status": "failed",
                    "last_error": message,
                })
                client.table("watchlist_items").update(item_update).eq("id", watchlist_item_id).execute()
            except Exception as exc:
                if "last_probe_session_id" not in str(exc) and "last_scan_job_id" not in str(exc) and "last_scan_status" not in str(exc):
                    raise
                for key in ("last_probe_session_id", "last_scan_job_id", "last_scan_status", "last_error"):
                    item_update.pop(key, None)
                client.table("watchlist_items").update(item_update).eq("id", watchlist_item_id).execute()
            errors = list(metadata.get("errors") or [])
            errors.append({
                "watchlist_item_id": watchlist_item_id,
                "target_url": item.get("target_url"),
                "session_id": session.get("session_id"),
                "message": message,
            })
            metadata["errors"] = errors[-100:]

        processed.add(watchlist_item_id)
        metadata["processed_item_ids"] = sorted(processed)
        metadata["last_progress_at"] = _now()
        updated_job = client.table("scan_jobs").update({
            "completed_count": completed,
            "failed_count": failed,
            "metadata": metadata,
        }).eq("id", scan_job_id).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": job["organization_id"],
            "actor_user_id": user_id,
            "action": "scan_job.target_recorded",
            "entity_type": "scan_job",
            "entity_id": scan_job_id,
            "metadata": {
                "watchlist_item_id": watchlist_item_id,
                "evidence_items": len(evidence_rows),
                "finding_id": finding.get("id") if finding else None,
            },
        }).execute()
        return {"scan_job": updated_job, "finding": finding, "evidence_items": evidence_rows, "duplicate": False}

    return await _thread(work)


def _terminal_scan_status(job: dict[str, Any], error: Optional[str] = None) -> str:
    if error:
        return "failed"
    target_count = int(job.get("target_count") or 0)
    completed = int(job.get("completed_count") or 0)
    failed = int(job.get("failed_count") or 0)
    if target_count <= 0:
        return "completed"
    if completed <= 0 and failed >= target_count:
        return "failed"
    return "completed"


async def finish_scan_job(user_id: str, scan_job_id: str, error: Optional[str] = None) -> dict[str, Any]:
    """Mark a live scan job completed or failed after all available targets were attempted."""
    client = _store_client()
    if not client:
        workspace = _workspace_for_user(user_id)
        job = _find_one(workspace["scan_jobs"], id=scan_job_id)
        if not job:
            raise EnterpriseAccessError("Scan job not found")
        metadata = _scan_metadata(job)
        if error:
            metadata["terminal_error"] = error
        metadata["finished_at"] = _now()
        metadata["realized_cost_usd"] = _estimate_job_cost(job.get("audit_depth") or "smart24", job.get("completed_count") or 0)
        job.update({
            "status": _terminal_scan_status(job, error),
            "completed_at": _now(),
            "metadata": metadata,
        })
        _record_audit(workspace, user_id, f"scan_job.{job['status']}", "scan_job", scan_job_id, {
            "completed_count": job.get("completed_count"),
            "failed_count": job.get("failed_count"),
        })
        return {"scan_job": job}

    def work():
        jobs = client.table("scan_jobs").select("*").eq("id", scan_job_id).limit(1).execute().data or []
        if not jobs:
            raise EnterpriseAccessError("Scan job not found")
        job = jobs[0]
        memberships = client.table("organization_members").select("id").eq("organization_id", job["organization_id"]).eq("user_id", user_id).limit(1).execute().data or []
        if not memberships:
            raise EnterpriseAccessError("Scan job not found")
        metadata = _scan_metadata(job)
        if error:
            metadata["terminal_error"] = error
        metadata["finished_at"] = _now()
        metadata["realized_cost_usd"] = _estimate_job_cost(job.get("audit_depth") or "smart24", job.get("completed_count") or 0)
        status = _terminal_scan_status(job, error)
        updated = client.table("scan_jobs").update({
            "status": status,
            "completed_at": _now(),
            "metadata": metadata,
        }).eq("id", scan_job_id).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": job["organization_id"],
            "actor_user_id": user_id,
            "action": f"scan_job.{status}",
            "entity_type": "scan_job",
            "entity_id": scan_job_id,
            "metadata": {
                "completed_count": updated.get("completed_count"),
                "failed_count": updated.get("failed_count"),
            },
        }).execute()
        return {"scan_job": updated}

    return await _thread(work)


def _enrich_evidence(workspace: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    finding = _find_one(workspace["findings"], id=evidence.get("finding_id")) if evidence.get("finding_id") else None
    item = _find_one(workspace["watchlist_items"], id=(finding or {}).get("watchlist_item_id")) if finding else None
    product = _find_one(workspace["products"], id=(finding or item or {}).get("product_id"))
    seller = _find_one(workspace["sellers"], id=(finding or item or {}).get("seller_id"))
    return {
        **evidence,
        "finding": finding,
        "product": product,
        "seller": seller,
        "watchlist_item": item,
    }


async def list_evidence_items(
    user_id: str,
    *,
    finding_id: Optional[str] = None,
    scan_job_id: Optional[str] = None,
    limit: int = 100,
) -> dict[str, Any]:
    """List evidence rows available to the signed-in user's organization."""
    limit = max(1, min(int(limit or 100), 250))
    client = _store_client()
    if not client:
        workspace = _workspace_for_user(user_id)
        rows = list(workspace["evidence_items"])
        if finding_id:
            rows = [row for row in rows if row.get("finding_id") == finding_id]
        if scan_job_id:
            rows = [row for row in rows if row.get("scan_job_id") == scan_job_id]
        rows = sorted(rows, key=lambda row: row.get("captured_at", ""), reverse=True)[:limit]
        return {"evidence_items": [_enrich_evidence(workspace, row) for row in rows]}

    org = await _ensure_supabase_org(client, user_id)

    def work():
        query = client.table("evidence_items").select("*").eq("organization_id", org["id"]).order("captured_at", desc=True).limit(limit)
        if finding_id:
            query = query.eq("finding_id", finding_id)
        if scan_job_id:
            query = query.eq("scan_job_id", scan_job_id)
        rows = query.execute().data or []

        finding_ids = list({row["finding_id"] for row in rows if row.get("finding_id")})
        findings = {}
        products = {}
        sellers = {}
        items = {}
        if finding_ids:
            finding_rows = client.table("findings").select("*").in_("id", finding_ids).execute().data or []
            findings = {row["id"]: row for row in finding_rows}
            item_ids = list({row["watchlist_item_id"] for row in finding_rows if row.get("watchlist_item_id")})
            product_ids = list({row["product_id"] for row in finding_rows if row.get("product_id")})
            seller_ids = list({row["seller_id"] for row in finding_rows if row.get("seller_id")})
            if item_ids:
                items = {row["id"]: row for row in (client.table("watchlist_items").select("*").in_("id", item_ids).execute().data or [])}
            if product_ids:
                products = {row["id"]: row for row in (client.table("products").select("*").in_("id", product_ids).execute().data or [])}
            if seller_ids:
                sellers = {row["id"]: row for row in (client.table("sellers").select("*").in_("id", seller_ids).execute().data or [])}

        enriched = []
        for row in rows:
            finding = findings.get(row.get("finding_id"))
            enriched.append({
                **row,
                "finding": finding,
                "watchlist_item": items.get((finding or {}).get("watchlist_item_id")),
                "product": products.get((finding or {}).get("product_id")),
                "seller": sellers.get((finding or {}).get("seller_id")),
            })
        return {"evidence_items": enriched}

    return await _thread(work)


async def get_evidence_item(user_id: str, evidence_id: str) -> dict[str, Any]:
    """Fetch one evidence row with related finding/product/seller context."""
    client = _store_client()
    if not client:
        workspace = _workspace_for_user(user_id)
        row = _find_one(workspace["evidence_items"], id=evidence_id)
        if not row:
            raise EnterpriseAccessError("Evidence item not found")
        return {"evidence_item": _enrich_evidence(workspace, row)}

    org = await _ensure_supabase_org(client, user_id)

    def work():
        rows = client.table("evidence_items").select("*").eq("id", evidence_id).eq("organization_id", org["id"]).limit(1).execute().data or []
        if not rows:
            raise EnterpriseAccessError("Evidence item not found")
        row = rows[0]
        finding = None
        product = None
        seller = None
        item = None
        if row.get("finding_id"):
            finding_rows = client.table("findings").select("*").eq("id", row["finding_id"]).eq("organization_id", org["id"]).limit(1).execute().data or []
            finding = finding_rows[0] if finding_rows else None
            if finding:
                if finding.get("watchlist_item_id"):
                    item_rows = client.table("watchlist_items").select("*").eq("id", finding["watchlist_item_id"]).limit(1).execute().data or []
                    item = item_rows[0] if item_rows else None
                if finding.get("product_id"):
                    product_rows = client.table("products").select("*").eq("id", finding["product_id"]).limit(1).execute().data or []
                    product = product_rows[0] if product_rows else None
                if finding.get("seller_id"):
                    seller_rows = client.table("sellers").select("*").eq("id", finding["seller_id"]).limit(1).execute().data or []
                    seller = seller_rows[0] if seller_rows else None
        return {"evidence_item": {**row, "finding": finding, "product": product, "seller": seller, "watchlist_item": item}}

    return await _thread(work)


def _parse_time(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _share_token_public(row: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in row.items() if k != "token_hash"}


def _finding_packet_from_workspace(workspace: dict[str, Any], finding_id: str) -> dict[str, Any]:
    finding = _find_one(workspace["findings"], id=finding_id)
    if not finding:
        raise EnterpriseAccessError("Finding not found")
    item = _find_one(workspace["watchlist_items"], id=finding.get("watchlist_item_id")) if finding.get("watchlist_item_id") else None
    product = _find_one(workspace["products"], id=finding.get("product_id")) if finding.get("product_id") else None
    seller = _find_one(workspace["sellers"], id=finding.get("seller_id")) if finding.get("seller_id") else None
    evidence = [
        _enrich_evidence(workspace, row)
        for row in workspace["evidence_items"]
        if row.get("finding_id") == finding_id
    ]
    evidence = sorted(evidence, key=lambda row: row.get("captured_at", ""), reverse=True)
    return {
        "organization": workspace["organization"],
        "finding": finding,
        "watchlist_item": item,
        "product": product,
        "seller": seller,
        "evidence_items": evidence,
    }


async def get_finding_packet(user_id: str, finding_id: str) -> dict[str, Any]:
    """Return a finding with the evidence needed for reports/shares."""
    client = _store_client()
    if not client:
        return _finding_packet_from_workspace(_workspace_for_user(user_id), finding_id)

    org = await _ensure_supabase_org(client, user_id)

    def work():
        findings = client.table("findings").select("*").eq("id", finding_id).eq("organization_id", org["id"]).limit(1).execute().data or []
        if not findings:
            raise EnterpriseAccessError("Finding not found")
        finding = findings[0]
        item = None
        product = None
        seller = None
        if finding.get("watchlist_item_id"):
            rows = client.table("watchlist_items").select("*").eq("id", finding["watchlist_item_id"]).limit(1).execute().data or []
            item = rows[0] if rows else None
        if finding.get("product_id"):
            rows = client.table("products").select("*").eq("id", finding["product_id"]).eq("organization_id", org["id"]).limit(1).execute().data or []
            product = rows[0] if rows else None
        if finding.get("seller_id"):
            rows = client.table("sellers").select("*").eq("id", finding["seller_id"]).eq("organization_id", org["id"]).limit(1).execute().data or []
            seller = rows[0] if rows else None
        evidence = client.table("evidence_items").select("*").eq("organization_id", org["id"]).eq("finding_id", finding_id).order("captured_at", desc=True).limit(500).execute().data or []
        return {
            "organization": org,
            "finding": finding,
            "watchlist_item": item,
            "product": product,
            "seller": seller,
            "evidence_items": [
                {**row, "finding": finding, "watchlist_item": item, "product": product, "seller": seller}
                for row in evidence
            ],
        }

    return await _thread(work)


async def record_evidence_export(
    user_id: str,
    finding_id: str,
    *,
    format: str,
    checksum_sha256: str,
    byte_size: int,
    redacted: bool,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Persist an export audit record after bytes are generated."""
    packet = await get_finding_packet(user_id, finding_id)
    org_id = packet["organization"]["id"]
    client = _store_client()
    now = _now()
    if not client:
        workspace = _workspace_for_user(user_id)
        _require_memory_permission(workspace, user_id, "evidence.export")
        export = {
            "id": _id(),
            "organization_id": org_id,
            "finding_id": finding_id,
            "requested_by": user_id,
            "format": format,
            "status": "completed",
            "file_url": None,
            "checksum_sha256": checksum_sha256,
            "byte_size": byte_size,
            "redacted": redacted,
            "metadata": metadata or {},
            "created_at": now,
        }
        workspace.setdefault("evidence_exports", []).append(export)
        _record_audit(workspace, user_id, "evidence_export.created", "evidence_export", export["id"], {
            "finding_id": finding_id,
            "format": format,
            "checksum_sha256": checksum_sha256,
            "redacted": redacted,
        })
        return {"evidence_export": export}

    def work():
        require_permission(_supabase_membership_role(client, org_id, user_id), "evidence.export")
        export = client.table("evidence_exports").insert({
            "organization_id": org_id,
            "finding_id": finding_id,
            "requested_by": user_id,
            "format": format,
            "status": "completed",
            "file_url": None,
            "checksum_sha256": checksum_sha256,
            "byte_size": byte_size,
            "redacted": redacted,
            "metadata": metadata or {},
        }).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": org_id,
            "actor_user_id": user_id,
            "action": "evidence_export.created",
            "entity_type": "evidence_export",
            "entity_id": export["id"],
            "metadata": {
                "finding_id": finding_id,
                "format": format,
                "checksum_sha256": checksum_sha256,
                "redacted": redacted,
            },
        }).execute()
        return {"evidence_export": export}

    return await _thread(work)


async def create_share_token(
    user_id: str,
    finding_id: str,
    *,
    expires_hours: int = 168,
    redacted: bool = True,
) -> dict[str, Any]:
    """Create a revocable external share token for one finding."""
    packet = await get_finding_packet(user_id, finding_id)
    org_id = packet["organization"]["id"]
    token = secrets.token_urlsafe(32)
    token_hash = _sha256(token)
    expires_hours = max(1, min(int(expires_hours or 168), 24 * 90))
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=expires_hours)).isoformat()
    scope = "finding_read:redacted" if redacted else "finding_read"
    client = _store_client()
    if not client:
        workspace = _workspace_for_user(user_id)
        _require_memory_permission(workspace, user_id, "share.write")
        row = {
            "id": _id(),
            "organization_id": org_id,
            "finding_id": finding_id,
            "token_hash": token_hash,
            "scope": scope,
            "expires_at": expires_at,
            "revoked_at": None,
            "revoked_by": None,
            "redacted": redacted,
            "created_by": user_id,
            "created_at": _now(),
            "last_accessed_at": None,
        }
        workspace.setdefault("share_tokens", []).append(row)
        _record_audit(workspace, user_id, "share_token.created", "share_token", row["id"], {
            "finding_id": finding_id,
            "expires_at": expires_at,
            "redacted": redacted,
        })
        return {"share_token": _share_token_public(row), "token": token}

    def work():
        require_permission(_supabase_membership_role(client, org_id, user_id), "share.write")
        row = client.table("share_tokens").insert({
            "organization_id": org_id,
            "finding_id": finding_id,
            "token_hash": token_hash,
            "scope": scope,
            "expires_at": expires_at,
            "created_by": user_id,
            "redacted": redacted,
        }).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": org_id,
            "actor_user_id": user_id,
            "action": "share_token.created",
            "entity_type": "share_token",
            "entity_id": row["id"],
            "metadata": {
                "finding_id": finding_id,
                "expires_at": expires_at,
                "redacted": redacted,
            },
        }).execute()
        return {"share_token": _share_token_public(row), "token": token}

    return await _thread(work)


async def revoke_share_token(user_id: str, token_id: str) -> dict[str, Any]:
    """Revoke a share token owned by the user's organization."""
    client = _store_client()
    now = _now()
    if not client:
        workspace = _workspace_for_user(user_id)
        _require_memory_permission(workspace, user_id, "share.write")
        row = _find_one(workspace.setdefault("share_tokens", []), id=token_id)
        if not row:
            raise EnterpriseAccessError("Share token not found")
        row.update({"revoked_at": now, "revoked_by": user_id})
        _record_audit(workspace, user_id, "share_token.revoked", "share_token", token_id, {"finding_id": row.get("finding_id")})
        return {"share_token": _share_token_public(row)}

    def work():
        rows = client.table("share_tokens").select("*").eq("id", token_id).limit(1).execute().data or []
        if not rows:
            raise EnterpriseAccessError("Share token not found")
        row = rows[0]
        require_permission(_supabase_membership_role(client, row["organization_id"], user_id), "share.write")
        updated = client.table("share_tokens").update({
            "revoked_at": now,
            "revoked_by": user_id,
        }).eq("id", token_id).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": row["organization_id"],
            "actor_user_id": user_id,
            "action": "share_token.revoked",
            "entity_type": "share_token",
            "entity_id": token_id,
            "metadata": {"finding_id": row.get("finding_id")},
        }).execute()
        return {"share_token": _share_token_public(updated)}

    return await _thread(work)


async def list_members_and_invites(user_id: str) -> dict[str, Any]:
    client = _store_client()
    if not client:
        workspace = _workspace_for_user(user_id)
        _require_memory_permission(workspace, user_id, "workspace.read")
        return {
            "members": workspace.get("members", []),
            "invites": workspace.get("invites", []),
        }
    org = await _ensure_supabase_org(client, user_id)

    def work():
        role = _supabase_membership_role(client, org["id"], user_id)
        require_permission(role, "workspace.read")
        members = client.table("organization_members").select("id,organization_id,user_id,role,created_at").eq("organization_id", org["id"]).order("created_at", desc=True).execute().data or []
        try:
            invites = client.table("organization_invites").select("id,organization_id,email,role,expires_at,accepted_at,revoked_at,created_by,created_at").eq("organization_id", org["id"]).order("created_at", desc=True).execute().data or []
        except Exception:
            invites = []
        return {"members": members, "invites": invites}

    return await _thread(work)


async def create_organization_invite(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    email = _clean(payload.get("email")).lower()
    role = normalize_role(payload.get("role"))
    if not email or "@" not in email:
        raise EnterpriseValidationError("Invite email is invalid.")
    if role == "owner":
        raise EnterpriseValidationError("Invite users as admin, analyst, or viewer.")
    expires_hours = max(1, min(int(payload.get("expires_hours") or 168), 24 * 30))
    token = secrets.token_urlsafe(24)
    token_hash = _sha256(token)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=expires_hours)).isoformat()
    client = _store_client()
    if not client:
        workspace = _workspace_for_user(user_id)
        _require_memory_permission(workspace, user_id, "member.manage")
        invite = {
            "id": _id(),
            "organization_id": workspace["organization"]["id"],
            "email": email,
            "role": role,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "accepted_at": None,
            "revoked_at": None,
            "created_by": user_id,
            "created_at": _now(),
        }
        workspace.setdefault("invites", []).append(invite)
        _record_audit(workspace, user_id, "organization_invite.created", "organization_invite", invite["id"], {"email": email, "role": role})
        return {"invite": _share_token_public(invite), "token": token}

    org = await _ensure_supabase_org(client, user_id)

    def work():
        require_permission(_supabase_membership_role(client, org["id"], user_id), "member.manage")
        invite = client.table("organization_invites").insert({
            "organization_id": org["id"],
            "email": email,
            "role": role,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "created_by": user_id,
        }).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": org["id"],
            "actor_user_id": user_id,
            "action": "organization_invite.created",
            "entity_type": "organization_invite",
            "entity_id": invite["id"],
            "metadata": {"email": email, "role": role},
        }).execute()
        return {"invite": _share_token_public(invite), "token": token}

    return await _thread(work)


async def revoke_organization_invite(user_id: str, invite_id: str) -> dict[str, Any]:
    client = _store_client()
    now = _now()
    if not client:
        workspace = _workspace_for_user(user_id)
        _require_memory_permission(workspace, user_id, "member.manage")
        invite = _find_one(workspace.setdefault("invites", []), id=invite_id)
        if not invite:
            raise EnterpriseAccessError("Invite not found")
        invite["revoked_at"] = now
        _record_audit(workspace, user_id, "organization_invite.revoked", "organization_invite", invite_id, {"email": invite.get("email")})
        return {"invite": _share_token_public(invite)}

    org = await _ensure_supabase_org(client, user_id)

    def work():
        require_permission(_supabase_membership_role(client, org["id"], user_id), "member.manage")
        rows = client.table("organization_invites").select("*").eq("id", invite_id).eq("organization_id", org["id"]).limit(1).execute().data or []
        if not rows:
            raise EnterpriseAccessError("Invite not found")
        updated = client.table("organization_invites").update({"revoked_at": now}).eq("id", invite_id).execute().data[0]
        client.table("audit_log").insert({
            "organization_id": org["id"],
            "actor_user_id": user_id,
            "action": "organization_invite.revoked",
            "entity_type": "organization_invite",
            "entity_id": invite_id,
            "metadata": {"email": rows[0].get("email")},
        }).execute()
        return {"invite": _share_token_public(updated)}

    return await _thread(work)


async def get_shared_finding_packet(token: str) -> dict[str, Any]:
    """Resolve a public share token to a redacted finding packet."""
    token_hash = _sha256(_clean(token))
    now = datetime.now(timezone.utc)
    client = _store_client()
    if not client:
        for workspace in _MEMORY_WORKSPACES.values():
            for row in workspace.setdefault("share_tokens", []):
                expires_at = _parse_time(row.get("expires_at"))
                if row.get("token_hash") != token_hash or row.get("revoked_at") or not expires_at or expires_at <= now:
                    continue
                row["last_accessed_at"] = _now()
                return {
                    "share_token": _share_token_public(row),
                    "packet": _finding_packet_from_workspace(workspace, row["finding_id"]),
                    "redacted": bool(row.get("redacted", True)),
                }
        raise EnterpriseAccessError("Share token not found")

    def work():
        rows = client.table("share_tokens").select("*").eq("token_hash", token_hash).is_("revoked_at", "null").limit(1).execute().data or []
        if not rows:
            raise EnterpriseAccessError("Share token not found")
        row = rows[0]
        expires_at = _parse_time(row.get("expires_at"))
        if not expires_at or expires_at <= now:
            raise EnterpriseAccessError("Share token not found")
        client.table("share_tokens").update({"last_accessed_at": _now()}).eq("id", row["id"]).execute()
        org_rows = client.table("organizations").select("*").eq("id", row["organization_id"]).limit(1).execute().data or []
        findings = client.table("findings").select("*").eq("id", row["finding_id"]).eq("organization_id", row["organization_id"]).limit(1).execute().data or []
        if not findings:
            raise EnterpriseAccessError("Share token not found")
        finding = findings[0]
        item = None
        product = None
        seller = None
        if finding.get("watchlist_item_id"):
            item_rows = client.table("watchlist_items").select("*").eq("id", finding["watchlist_item_id"]).limit(1).execute().data or []
            item = item_rows[0] if item_rows else None
        if finding.get("product_id"):
            product_rows = client.table("products").select("*").eq("id", finding["product_id"]).eq("organization_id", row["organization_id"]).limit(1).execute().data or []
            product = product_rows[0] if product_rows else None
        if finding.get("seller_id"):
            seller_rows = client.table("sellers").select("*").eq("id", finding["seller_id"]).eq("organization_id", row["organization_id"]).limit(1).execute().data or []
            seller = seller_rows[0] if seller_rows else None
        evidence = client.table("evidence_items").select("*").eq("organization_id", row["organization_id"]).eq("finding_id", row["finding_id"]).order("captured_at", desc=True).limit(500).execute().data or []
        packet = {
            "organization": org_rows[0] if org_rows else {"id": row["organization_id"], "name": "Shared workspace"},
            "finding": finding,
            "watchlist_item": item,
            "product": product,
            "seller": seller,
            "evidence_items": [
                {**evidence_row, "finding": finding, "watchlist_item": item, "product": product, "seller": seller}
                for evidence_row in evidence
            ],
        }
        return {"share_token": _share_token_public(row), "packet": packet, "redacted": bool(row.get("redacted", True))}

    return await _thread(work)
