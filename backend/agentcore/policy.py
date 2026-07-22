"""
Jacobi for Agents — platform policy registry + gating.

Hard safety boundary: decides whether an agent may observe, prepare checkout,
or purchase on a given platform, based on the consent scope and whether an
official route is being used. Restricted platforms (terms prohibit automated
assistants / booking) get evidence-only treatment; demo/official-friendly
domains allow checkout preparation.

Dependency-light: pydantic (via schemas) + stdlib only.
"""

from __future__ import annotations

import json
import os
from urllib.parse import urlsplit

from .schemas import ActionMode, ConsentScope, PolicyDecision, ReasonCode

# Known platforms whose terms prohibit automated assistants / booking.
RESTRICTED_DOMAINS = {
    "booking.com",
    "airbnb.com",
    "expedia.com",
    "amazon.com",
    "agoda.com",
    "hotels.com",
}

DEFAULT_POLICIES: dict[str, ActionMode] = {
    **{d: ActionMode.evidence_only for d in RESTRICTED_DOMAINS},
    # Demo / official-friendly fixtures.
    "demo.jacobi.local": ActionMode.checkout_prepare_allowed,
    "hotel-official.example": ActionMode.checkout_prepare_allowed,
}

DEFAULT_OFFICIAL_ROUTE_DOMAINS = {
    "demo.jacobi.local",
    "hotel-official.example",
}


def _official_route_domains() -> set[str]:
    """Return the server-owned official-route registry.

    ``official_route`` is a caller claim, not proof. Only domains configured
    by the deployment (or the two non-networked demo domains) can turn that
    claim into an authorized route. This prevents a client from relabeling a
    restricted URL as an official merchant rail.
    """
    raw = os.getenv("JACOBI_OFFICIAL_ROUTE_DOMAINS")
    if not raw:
        return set(DEFAULT_OFFICIAL_ROUTE_DOMAINS)
    return {
        normalize_domain(value)
        for value in raw.split(",")
        if normalize_domain(value)
    }


def is_authorized_official_route(url_or_domain: str, claimed: bool) -> bool:
    """Validate a caller's official-route claim against server configuration."""
    if not claimed:
        return False
    domain = normalize_domain(url_or_domain)
    return any(domain == allowed or domain.endswith(f".{allowed}")
               for allowed in _official_route_domains())


def _load_overrides() -> dict[str, ActionMode]:
    """Parse JACOBI_POLICY_OVERRIDES (domain->mode JSON), defensively."""
    raw = os.getenv("JACOBI_POLICY_OVERRIDES")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, ActionMode] = {}
    for domain, mode in data.items():
        try:
            out[normalize_domain(str(domain))] = ActionMode(str(mode))
        except (ValueError, TypeError):
            continue  # ponytail: skip garbage entries, keep the rest
    return out


def normalize_domain(url_or_domain: str) -> str:
    """Registrable domain, lowercased: strip scheme/path/port/www."""
    s = (url_or_domain or "").strip().lower()
    if "//" not in s:
        s = "//" + s  # let urlsplit treat a bare host as netloc
    host = urlsplit(s).hostname or ""
    if host.startswith("www."):
        host = host[4:]
    return host


def _policies() -> dict[str, ActionMode]:
    merged = dict(DEFAULT_POLICIES)
    merged.update(_load_overrides())
    return merged


def evaluate(
    url_or_domain: str,
    scope: ConsentScope,
    official_route: bool = False,
) -> PolicyDecision:
    """Gate a platform for a consent scope. See module docstring for semantics."""
    domain = normalize_domain(url_or_domain)
    official_route = is_authorized_official_route(url_or_domain, official_route)
    restricted = domain in RESTRICTED_DOMAINS
    mode = _policies().get(domain)
    if mode is None:
        # Unknown domain: default recommendation-allowed posture; purchase rule
        # below still default-denies.
        mode = ActionMode.recommendation_allowed

    def decision(dec: str, reason_code, reason: str) -> PolicyDecision:
        return PolicyDecision(
            domain=domain,
            requested_scope=scope,
            action_mode=mode,
            decision=dec,
            reason_code=reason_code,
            reason=reason,
            official_route=official_route,
        )

    if mode == ActionMode.blocked:
        return decision(
            "block",
            ReasonCode.POLICY_FORBIDS_AUTOMATION,
            f"Automation is blocked for {domain} by policy.",
        )

    if scope == ConsentScope.purchase_authorized:
        if official_route or mode == ActionMode.purchase_authorized_allowed:
            return decision(
                "allow",
                None,
                (
                    f"Purchase permitted on {domain} via official route."
                    if official_route
                    else f"Purchase automation allowed for {domain} by policy."
                ),
            )
        rc = (
            ReasonCode.PLATFORM_AUTOMATION_RESTRICTED
            if restricted
            else ReasonCode.POLICY_FORBIDS_AUTOMATION
        )
        why = (
            f"{domain} restricts automated purchasing; use the official route "
            "or hand off to the user."
            if restricted
            else f"Purchase automation is not permitted for {domain} without an "
            "official route."
        )
        return decision("block", rc, why)

    if scope == ConsentScope.checkout_prepare:
        if mode in (
            ActionMode.checkout_prepare_allowed,
            ActionMode.purchase_authorized_allowed,
        ):
            return decision(
                "allow",
                None,
                f"Checkout preparation allowed for {domain}.",
            )
        # Restricted or evidence_only: collect evidence only, no checkout actions.
        rc = (
            ReasonCode.PLATFORM_AUTOMATION_RESTRICTED
            if restricted
            else ReasonCode.POLICY_FORBIDS_AUTOMATION
        )
        why = (
            f"{domain} restricts automated checkout; collect evidence only, no "
            "checkout actions."
            if restricted
            else f"Checkout automation not permitted for {domain}; evidence "
            "collection only."
        )
        return decision("warn", rc, why)

    # research_only / recommend: observation-only posture.
    if restricted:
        return decision(
            "warn",
            ReasonCode.PLATFORM_AUTOMATION_RESTRICTED,
            f"{domain} restricts automation; observation-only (research) is fine.",
        )
    return decision(
        "allow",
        None,
        f"Research and recommendation allowed for {domain}.",
    )
