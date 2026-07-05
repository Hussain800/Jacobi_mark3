"""
Jacobi for Agents — LocalPlaywrightProvider (PRD 8.x, evidence tier T1/local browser).

Real local-browser evidence: launches a headless Chromium via Playwright, loads
the target page, and captures HTML + screenshot + a network summary (and a
trace zip when enabled). This gives JavaScript-rendered evidence that the plain
httpx LocalHttpProvider cannot — but it is STILL local: it does not prove real
IP geography, does not defeat anti-bot/CAPTCHA, and reflects local rendering.

HARD BOUNDARY: this provider OBSERVES pages only. It NEVER clicks, fills, types,
logs in, or navigates checkout flows — there are deliberately zero
page.click / page.fill / page.type calls anywhere in this module. It only
navigates to the given URL and reads what renders.

Playwright is an OPTIONAL dependency (not in requirements.txt). When it is not
installed, is_available() returns False and the router simply does not offer
this provider.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

try:  # optional dependency — never in requirements.txt
    from playwright.sync_api import sync_playwright

    PLAYWRIGHT_AVAILABLE = True
except ImportError:  # pragma: no cover — depends on install state
    PLAYWRIGHT_AVAILABLE = False

from .extract import extract_price_fields
from .providers import CollectionProvider, _artifact_dir
from .schemas import Artifact, CollectionAttempt, ProviderCapabilities

try:  # backend/ is the app root on sys.path when run via uvicorn/pytest
    from url_guard import validate_public_url, UnsafeUrlError
except ImportError:  # e.g. invoked from repo root — add backend/ and retry
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from url_guard import validate_public_url, UnsafeUrlError


_PLAYWRIGHT_LIMITATIONS = [
    "Local browser emulation — does not prove real IP geography",
    "No anti-bot or CAPTCHA handling; protected pages may not render",
    "Screenshot reflects local rendering at collection time",
]


def is_available() -> bool:
    return PLAYWRIGHT_AVAILABLE and os.getenv("JACOBI_ENABLE_PLAYWRIGHT", "1") != "0"


def _trace_enabled() -> bool:
    return os.getenv("JACOBI_PLAYWRIGHT_TRACE") == "1"


def _prune(d: Path, patterns: tuple[str, ...]) -> None:
    """Bound the artifact dir for the file kinds THIS provider writes.

    providers._prune_artifacts only globs *.html, so png/json/zip would grow
    unbounded without this. Same cap env var, per-pattern."""
    cap = int(os.getenv("JACOBI_ARTIFACT_MAX_FILES", "500"))
    for pattern in patterns:
        files = sorted(d.glob(pattern), key=lambda p: p.stat().st_mtime)
        for stale in files[: max(0, len(files) - cap)]:
            try:
                stale.unlink()
            except OSError:
                pass


def _write(art_dir: Path, name: str, data: bytes) -> str | None:
    try:
        out = art_dir / name
        out.write_bytes(data)
        return str(out)
    except OSError:
        return None  # evidence still carries the sha256


class LocalPlaywrightProvider(CollectionProvider):
    name = "local_playwright"

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            provider=self.name,
            http_fetch=False,
            js_render=True,
            browser_actions=True,
            screenshot=True,
            html_capture=True,
            network_log=True,
            trace_zip=_trace_enabled(),
            locale_emulation=True,
            timezone_emulation=True,
            geolocation_emulation=False,
            real_ip_geolocation=False,
            captcha_handling=False,
            anti_bot_managed=False,
            official_api=False,
            cost_unit="free",
        )

    def estimate_cost(self, url: str) -> float:
        return 0.0

    def collect(self, url: str, stage: str) -> CollectionAttempt:
        started = datetime.now(timezone.utc)
        attempt = CollectionAttempt(
            provider=self.name, stage=stage, url=url, final_url=url,
            capabilities=self.capabilities(),
            limitations=list(_PLAYWRIGHT_LIMITATIONS),
            started_at=started,
        )

        try:
            validate_public_url(url)
        except UnsafeUrlError as exc:
            attempt.error = f"unsafe url rejected: {exc}"
            attempt.ended_at = datetime.now(timezone.utc)
            return attempt

        trace = _trace_enabled()
        art_dir = _artifact_dir()
        net = {"requests": 0, "hosts": set(), "approx_bytes": 0}

        pw = browser = context = None
        try:
            pw = sync_playwright().start()
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1366, "height": 900},
                locale="en-US",
                timezone_id="UTC",
            )
            if trace:
                context.tracing.start(screenshots=True, snapshots=False)

            def _on_response(resp) -> None:
                net["requests"] += 1
                try:
                    from urllib.parse import urlsplit

                    host = urlsplit(resp.url).hostname
                    if host:
                        net["hosts"].add(host)
                    # Never read the body — use content-length header when present.
                    cl = resp.headers.get("content-length")
                    net["approx_bytes"] += int(cl) if cl and cl.isdigit() else 0
                except Exception:
                    pass

            page = context.new_page()
            page.on("response", _on_response)

            response = page.goto(url, wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(500)

            attempt.final_url = page.url
            if response is not None:
                attempt.http_status = response.status

            # Redirect TOCTOU guard: the pre-goto check validated the request
            # URL, but the browser follows redirects — re-validate where we
            # actually landed so a public URL 302ing to a private/metadata
            # address never gets its content captured as evidence.
            try:
                validate_public_url(page.url)
            except UnsafeUrlError as exc:
                attempt.error = f"unsafe redirect target rejected: {exc}"
                attempt.limitations.append(
                    "Navigation redirected to a non-public address; no artifacts captured."
                )
                return attempt

            artifacts: list[Artifact] = []

            html = page.content()
            html_bytes = html.encode("utf-8")
            html_sha = hashlib.sha256(html_bytes).hexdigest()
            html_uri = _write(art_dir, f"{html_sha}.html", html_bytes)
            _prune(art_dir, ("*.html",))  # keep parity with providers cap
            artifacts.append(Artifact(
                kind="html", sha256=html_sha, storage_uri=html_uri,
                bytes=len(html_bytes), content_type="text/html",
            ))

            png = page.screenshot(type="png")
            png_sha = hashlib.sha256(png).hexdigest()
            png_uri = _write(art_dir, f"{png_sha}.png", png)
            artifacts.append(Artifact(
                kind="screenshot", sha256=png_sha, storage_uri=png_uri,
                bytes=len(png), content_type="image/png",
            ))

            net_summary = {
                "requests": net["requests"],
                "hosts": sorted(net["hosts"]),
                "approx_bytes": net["approx_bytes"],
            }
            net_bytes = json.dumps(net_summary, sort_keys=True).encode("utf-8")
            net_sha = hashlib.sha256(net_bytes).hexdigest()
            net_uri = _write(art_dir, f"{net_sha}.json", net_bytes)
            artifacts.append(Artifact(
                kind="network_summary", sha256=net_sha, storage_uri=net_uri,
                bytes=len(net_bytes), content_type="application/json",
            ))

            if trace:
                trace_path = art_dir / f"trace_{attempt.attempt_id}.zip"
                context.tracing.stop(path=str(trace_path))
                try:
                    trace_bytes = trace_path.read_bytes()
                    trace_sha = hashlib.sha256(trace_bytes).hexdigest()
                    final_trace = art_dir / f"{trace_sha}.zip"
                    trace_path.replace(final_trace)
                    artifacts.append(Artifact(
                        kind="trace", sha256=trace_sha, storage_uri=str(final_trace),
                        bytes=len(trace_bytes), content_type="application/zip",
                    ))
                except OSError:
                    pass

            _prune(art_dir, ("*.png", "*.json", "*.zip"))

            attempt.artifacts = artifacts
            attempt.extractions = extract_price_fields(html)
        except Exception as exc:  # any playwright/runtime error → honest error attempt
            attempt.error = f"playwright collection failed: {exc.__class__.__name__}: {exc}"
        finally:
            for closer in (context, browser):
                try:
                    if closer is not None:
                        closer.close()
                except Exception:
                    pass
            try:
                if pw is not None:
                    pw.stop()
            except Exception:
                pass

        attempt.ended_at = datetime.now(timezone.utc)
        return attempt
