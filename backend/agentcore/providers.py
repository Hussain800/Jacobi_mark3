"""
Jacobi for Agents — collection providers, provider router, budget guardrails.

Providers are interchangeable evidence backends behind CollectionProvider
(PRD 8.x). v0 ships two honest local providers:

  FixtureProvider  — deterministic demo fixtures (labeled as such everywhere)
  LocalHttpProvider — real HTTP fetch via httpx behind the existing SSRF
                      url_guard; NO JavaScript rendering, NO screenshots,
                      NO real-IP geography claims. Limitations say so.

Managed providers (Browserbase/Zyte/Bright Data) are future adapters that
implement the same interface behind capability flags — deliberately not built
until a paying need exists (ponytail: YAGNI).
"""

from __future__ import annotations

import hashlib
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .extract import extract_price_fields
from .schemas import (
    Artifact,
    BudgetStatus,
    CollectionAttempt,
    ProviderCapabilities,
)

try:  # backend/ is the app root on sys.path when run via uvicorn/pytest
    from url_guard import validate_public_url, UnsafeUrlError
except ImportError:  # e.g. invoked from repo root — add backend/ and retry
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from url_guard import validate_public_url, UnsafeUrlError

_FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"

FIXTURE_URLS = {
    "fixture://lodging/listing": _FIXTURE_DIR / "lodging_listing.html",
    "fixture://lodging/checkout_prep": _FIXTURE_DIR / "lodging_checkout_prep.html",
    "fixture://restricted/listing": _FIXTURE_DIR / "restricted_listing.html",
}

_FIXTURE_LIMITATION = "Deterministic demo fixture — not a live merchant page"
_LOCAL_HTTP_LIMITATIONS = [
    "Local HTTP fetch — no JavaScript rendering; dynamic prices may be missed",
    "Does not prove real IP geography",
    "No screenshot capability in local HTTP mode",
]


def _artifact_dir() -> Path:
    d = Path(os.getenv("JACOBI_ARTIFACT_DIR", str(Path(__file__).resolve().parent / "_artifacts")))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _prune_artifacts(d: Path) -> None:
    """Keep the artifact dir bounded: unauthenticated /verify calls each write
    one HTML file, so without a cap this is a disk-fill vector."""
    cap = int(os.getenv("JACOBI_ARTIFACT_MAX_FILES", "500"))
    files = sorted(d.glob("*.html"), key=lambda p: p.stat().st_mtime)
    for stale in files[: max(0, len(files) - cap)]:
        try:
            stale.unlink()
        except OSError:
            pass


class CollectionProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    def capabilities(self) -> ProviderCapabilities: ...

    @abstractmethod
    def estimate_cost(self, url: str) -> float: ...

    @abstractmethod
    def collect(self, url: str, stage: str) -> CollectionAttempt: ...


class FixtureProvider(CollectionProvider):
    name = "fixture"

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            provider=self.name,
            html_capture=True,
            cost_unit="free",
        )

    def estimate_cost(self, url: str) -> float:
        return 0.0

    def collect(self, url: str, stage: str) -> CollectionAttempt:
        started = datetime.now(timezone.utc)
        path = FIXTURE_URLS.get(url)
        if path is None or not path.exists():
            return CollectionAttempt(
                provider=self.name, stage=stage, url=url, final_url=url,
                capabilities=self.capabilities(), fixture=True,
                started_at=started, ended_at=datetime.now(timezone.utc),
                error=f"unknown fixture url: {url}",
                limitations=[_FIXTURE_LIMITATION],
            )
        raw = path.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        html = raw.decode("utf-8", errors="replace")
        return CollectionAttempt(
            provider=self.name, stage=stage, url=url, final_url=url,
            http_status=200,
            started_at=started, ended_at=datetime.now(timezone.utc),
            capabilities=self.capabilities(),
            artifacts=[Artifact(
                kind="html", sha256=sha, storage_uri=str(path),
                bytes=len(raw), content_type="text/html", fixture=True,
            )],
            extractions=extract_price_fields(html),
            limitations=[_FIXTURE_LIMITATION],
            cost_estimate_usd=0.0,
            fixture=True,
        )


class LocalHttpProvider(CollectionProvider):
    name = "local_http"

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            provider=self.name,
            http_fetch=True,
            html_capture=True,
            cost_unit="free",
        )

    def estimate_cost(self, url: str) -> float:
        return 0.0

    def collect(self, url: str, stage: str) -> CollectionAttempt:
        started = datetime.now(timezone.utc)
        base = CollectionAttempt(
            provider=self.name, stage=stage, url=url, final_url=url,
            capabilities=self.capabilities(),
            limitations=list(_LOCAL_HTTP_LIMITATIONS),
            started_at=started,
        )
        try:
            validate_public_url(url)
        except UnsafeUrlError as exc:
            base.error = f"unsafe url rejected: {exc}"
            base.ended_at = datetime.now(timezone.utc)
            return base
        try:
            resp = httpx.get(
                url,
                timeout=15.0,
                follow_redirects=False,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/126.0 Safari/537.36 JacobiVerifier/1.0"
                    )
                },
            )
        except httpx.HTTPError as exc:
            base.error = f"fetch failed: {exc.__class__.__name__}: {exc}"
            base.ended_at = datetime.now(timezone.utc)
            return base

        # Redirect TOCTOU guard: even with follow_redirects=False a 3xx
        # response carries a Location that may point at a non-public address.
        # Revalidate the final target (the request URL when no redirect
        # followed, or the Location header when one was offered) so a public
        # URL 302ing into a private/metadata address is never captured as
        # evidence. Mirrors the playwright provider guard.
        redirect_target = resp.headers.get("location")
        final_candidate = redirect_target or str(resp.url) or url
        try:
            validate_public_url(final_candidate)
        except UnsafeUrlError as exc:
            base.error = f"unsafe redirect target rejected: {exc}"
            base.ended_at = datetime.now(timezone.utc)
            return base

        raw = resp.content
        sha = hashlib.sha256(raw).hexdigest()
        art_dir = _artifact_dir()
        out_path = art_dir / f"{sha}.html"
        try:
            out_path.write_bytes(raw)
            storage = str(out_path)
            _prune_artifacts(art_dir)
        except OSError:
            storage = None  # evidence still carries the hash
        base.final_url = str(resp.url)
        base.http_status = resp.status_code
        base.artifacts = [Artifact(
            kind="html", sha256=sha, storage_uri=storage,
            bytes=len(raw), content_type=resp.headers.get("content-type", "text/html"),
        )]
        base.extractions = extract_price_fields(raw.decode("utf-8", errors="replace"))
        base.ended_at = datetime.now(timezone.utc)
        return base


class BudgetTracker:
    """Per-process spend guardrail (PRD 8.4). Managed providers must check
    before spending; local/fixture providers cost 0 so this only bites once
    paid adapters exist — the budget_blocked path is wired and tested now."""

    def __init__(self) -> None:
        self.limit_usd = float(os.getenv("JACOBI_AGENT_BUDGET_USD", "5.0"))
        self.spent = 0.0

    def check(self, cost: float) -> BudgetStatus:
        if self.spent + cost > self.limit_usd:
            return BudgetStatus.blocked
        if self.limit_usd > 0 and (self.spent + cost) > 0.8 * self.limit_usd:
            return BudgetStatus.near_limit
        return BudgetStatus.ok

    def add(self, cost: float) -> None:
        self.spent += cost


budget = BudgetTracker()


def choose_provider(url: str) -> CollectionProvider:
    """Provider router: fixtures → FixtureProvider; real URLs → Playwright
    browser evidence when the optional dependency is installed, else local
    HTTP. Managed adapters slot in here behind capability/budget/policy
    checks."""
    if url.startswith("fixture://"):
        return FixtureProvider()
    try:
        from .playwright_provider import LocalPlaywrightProvider, is_available

        if is_available():
            return LocalPlaywrightProvider()
    except ImportError:
        pass
    return LocalHttpProvider()


def _budget_blocked_attempt(provider: CollectionProvider, url: str, stage: str,
                            cost: float) -> CollectionAttempt:
    now = datetime.now(timezone.utc)
    return CollectionAttempt(
        provider=provider.name, stage=stage, url=url, final_url=url,
        capabilities=provider.capabilities(),
        started_at=now, ended_at=now,
        error="budget_blocked",
        limitations=[
            f"Collection skipped: estimated cost ${cost:.2f} exceeds remaining budget",
        ],
        cost_estimate_usd=cost,
    )


def collect_stages(url: str) -> list[CollectionAttempt]:
    """Collect the evidence stages for a target URL.

    fixture lodging listing → listing + checkout_prep pair (fee-drift demo);
    other fixtures and real URLs → single listing-stage attempt.
    """
    stages: list[tuple[str, str]]
    if url == "fixture://lodging/listing":
        stages = [(url, "listing"), ("fixture://lodging/checkout_prep", "checkout_prep")]
    elif url == "fixture://lodging/checkout_prep":
        stages = [(url, "checkout_prep")]
    else:
        stages = [(url, "listing")]

    attempts: list[CollectionAttempt] = []
    for target, stage in stages:
        provider = choose_provider(target)
        cost = provider.estimate_cost(target)
        if budget.check(cost) == BudgetStatus.blocked:
            attempts.append(_budget_blocked_attempt(provider, target, stage, cost))
            continue
        attempt = provider.collect(target, stage)
        budget.add(cost)
        attempts.append(attempt)
    return attempts