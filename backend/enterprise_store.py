"""Enterprise workspace persistence for the Jacobi price-integrity pivot."""

from __future__ import annotations

import asyncio
import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

from map_policy import evaluate_map_observation
from supabase_client import get_supabase


DEFAULT_WORKSPACE_NAME = "Jacobi Pilot Workspace"

_MEMORY_WORKSPACES: dict[str, dict[str, Any]] = {}


class EnterpriseAccessError(Exception):
    """Raised when the caller cannot access an enterprise object."""


class EnterpriseValidationError(Exception):
    """Raised for invalid enterprise workflow input."""


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
        "watchlists": [],
        "products": [],
        "sellers": [],
        "watchlist_items": [],
        "scan_jobs": [],
        "findings": [],
        "evidence_items": [],
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


def _normalize_cadence(value: Any) -> str:
    cadence = _clean(value, "weekly").lower()
    return cadence if cadence in {"manual", "daily", "weekly", "monthly"} else "weekly"


def _normalize_workflow(value: Any) -> str:
    workflow = _clean(value, "map").lower()
    return workflow if workflow in {"map", "surveillance"} else "map"


def _normalize_auth_status(value: Any) -> str:
    status = _clean(value, "unknown").lower()
    return status if status in {"authorized", "unauthorized", "unknown"} else "unknown"


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
        "watchlists": workspace["watchlists"],
        "products": workspace["products"],
        "sellers": workspace["sellers"],
        "watchlist_items": workspace["watchlist_items"],
        "scan_jobs": workspace["scan_jobs"],
        "findings_raw": workspace["findings"],
        "evidence_items": workspace["evidence_items"],
        "audit_log": workspace["audit_log"][-50:],
        "portfolio": _build_portfolio(workspace),
        "findings": _build_findings(workspace),
        "kpis": _build_kpis(workspace),
    }


def _create_watchlist_memory(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    workspace = _workspace_for_user(user_id)
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
        if not _valid_public_url_shape(target_url):
            errors.append({"row": idx, "message": "target_url must be an http(s) URL."})
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
    watchlist_id = _clean(payload.get("watchlist_id"))
    watchlist = _find_one(workspace["watchlists"], id=watchlist_id)
    if not watchlist:
        raise EnterpriseAccessError("Watchlist not found")

    limit = int(payload.get("limit") or 50)
    items = [item for item in workspace["watchlist_items"] if item.get("watchlist_id") == watchlist_id and item.get("status") == "active"][:limit]
    job = {
        "id": _id(),
        "organization_id": workspace["organization"]["id"],
        "watchlist_id": watchlist_id,
        "requested_by": user_id,
        "audit_depth": _clean(payload.get("audit_depth"), "smart24"),
        "status": "running",
        "target_count": len(items),
        "completed_count": 0,
        "failed_count": 0,
        "queued_at": _now(),
        "started_at": _now(),
        "completed_at": None,
        "metadata": {"source": "csv_policy_preview"},
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

    job["status"] = "completed" if job["completed_count"] else "queued"
    job["completed_at"] = _now() if job["completed_count"] else None
    if job["status"] == "queued":
        job["metadata"]["reason"] = "No imported observed prices. Ready for live probe worker handoff."
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
        watchlist_ids = [w["id"] for w in watchlists]
        items = []
        if watchlist_ids:
            items = client.table("watchlist_items").select("*").in_("watchlist_id", watchlist_ids).order("created_at", desc=True).execute().data or []
        scan_jobs = client.table("scan_jobs").select("*").eq("organization_id", org_id).order("queued_at", desc=True).limit(25).execute().data or []
        findings = client.table("findings").select("*").eq("organization_id", org_id).order("created_at", desc=True).limit(100).execute().data or []
        finding_ids = [f["id"] for f in findings]
        evidence_items = []
        if finding_ids:
            evidence_items = client.table("evidence_items").select("*").in_("finding_id", finding_ids).order("captured_at", desc=True).execute().data or []
        audit_log = client.table("audit_log").select("*").eq("organization_id", org_id).order("created_at", desc=True).limit(50).execute().data or []
        for item in items:
            wl = next((w for w in watchlists if w["id"] == item.get("watchlist_id")), None)
            item["cadence"] = (wl or {}).get("cadence", "manual").capitalize()
        return {
            "organization": org,
            "watchlists": watchlists,
            "products": products,
            "sellers": sellers,
            "watchlist_items": items,
            "scan_jobs": scan_jobs,
            "findings": findings,
            "evidence_items": evidence_items,
            "audit_log": audit_log,
        }

    return _serialize_workspace(await _thread(work), "supabase")


async def get_workspace(user_id: str) -> dict[str, Any]:
    client = get_supabase()
    if client:
        return await _workspace_supabase(client, user_id)
    return _serialize_workspace(_workspace_for_user(user_id), "memory")


async def create_watchlist(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    client = get_supabase()
    if not client:
        return _create_watchlist_memory(user_id, payload)

    org = await _ensure_supabase_org(client, user_id, payload.get("org_id"))

    def work():
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
    client = get_supabase()
    if not client:
        return _import_items_memory(user_id, watchlist_id, csv_text)

    rows, errors = _parse_csv(csv_text)

    def work():
        watchlists = client.table("watchlists").select("*").eq("id", watchlist_id).limit(1).execute().data or []
        if not watchlists:
            raise EnterpriseAccessError("Watchlist not found")
        watchlist = watchlists[0]
        org_id = watchlist["organization_id"]
        memberships = client.table("organization_members").select("id").eq("organization_id", org_id).eq("user_id", user_id).limit(1).execute().data or []
        if not memberships:
            raise EnterpriseAccessError("Watchlist not found")

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
            if not _valid_public_url_shape(target_url):
                errors.append({"row": idx, "message": "target_url must be an http(s) URL."})
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
    client = get_supabase()
    if not client:
        return _launch_scan_memory(user_id, payload)

    def work():
        watchlist_id = _clean(payload.get("watchlist_id"))
        watchlists = client.table("watchlists").select("*").eq("id", watchlist_id).limit(1).execute().data or []
        if not watchlists:
            raise EnterpriseAccessError("Watchlist not found")
        watchlist = watchlists[0]
        org_id = watchlist["organization_id"]
        memberships = client.table("organization_members").select("id").eq("organization_id", org_id).eq("user_id", user_id).limit(1).execute().data or []
        if not memberships:
            raise EnterpriseAccessError("Watchlist not found")
        limit = int(payload.get("limit") or 50)
        items = client.table("watchlist_items").select("*").eq("watchlist_id", watchlist_id).eq("status", "active").limit(limit).execute().data or []
        job = client.table("scan_jobs").insert({
            "organization_id": org_id,
            "watchlist_id": watchlist_id,
            "requested_by": user_id,
            "audit_depth": _clean(payload.get("audit_depth"), "smart24"),
            "status": "running",
            "target_count": len(items),
            "started_at": _now(),
            "metadata": {"source": "csv_policy_preview"},
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

        status = "completed" if completed else "queued"
        metadata = {"source": "csv_policy_preview"}
        if status == "queued":
            metadata["reason"] = "No imported observed prices. Ready for live probe worker handoff."
        client.table("scan_jobs").update({
            "status": status,
            "completed_count": completed,
            "failed_count": failed,
            "completed_at": _now() if completed else None,
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
