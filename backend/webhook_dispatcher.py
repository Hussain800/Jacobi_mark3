"""
webhook_dispatcher.py
=====================
Asynchronous webhook dispatcher that implements the **Transactional Outbox**
pattern.  Polls `outbox_log` for actionable events, resolves matching
`webhook_configs`, signs each payload with HMAC-SHA256, and delivers via
HTTPS with exponential back-off + full jitter on failure.

Security:
    • SSRF protection – DNS is pre-resolved and private/reserved IP ranges
      (RFC 1918, loopback, link-local, RFC 6598) are rejected before any
      request leaves the process.
    • HMAC-SHA256 request signing so receivers can authenticate origin.

Retry semantics:
    t_retry = random(0, min(T_MAX, T_BASE × 2^attempt))   (full jitter)
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import random
import socket
import time
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("webhook_dispatcher")
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
T_BASE: float = 1.0          # base delay in seconds
T_MAX: float = 300.0         # ceiling delay in seconds  (5 min)
MAX_RETRIES: int = 8          # after 8 failures the event is marked terminal
POLL_INTERVAL: float = 2.0   # seconds between outbox scans
DELIVERY_TIMEOUT: float = 10.0  # per-request timeout in seconds
BATCH_SIZE: int = 50          # max rows claimed per poll cycle


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class OutboxStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class OutboxEvent(BaseModel):
    """Mirrors a row in `outbox_log`."""

    id: int
    aggregate_type: str = Field(..., max_length=50)
    aggregate_id: str = Field(..., max_length=100)
    event_type: str = Field(..., max_length=100)
    payload: dict = Field(default_factory=dict)
    status: OutboxStatus = OutboxStatus.PENDING
    retry_count: int = 0
    next_retry_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WebhookConfig(BaseModel):
    """Mirrors a row in `webhook_configs`."""

    id: str  # UUID as string
    user_id: str
    destination_url: str
    secret_key: str
    target_domains: list[str] = Field(default_factory=list)
    price_spread_threshold: int = 0  # cents
    is_active: bool = True

    @field_validator("destination_url")
    @classmethod
    def _must_be_https(cls, v: str) -> str:
        if not v.lower().startswith("https://"):
            raise ValueError("destination_url must use HTTPS")
        return v


# ---------------------------------------------------------------------------
# WebhookDispatcher
# ---------------------------------------------------------------------------
class WebhookDispatcher:
    """
    Core dispatcher that:
      1. Polls `outbox_log` for PENDING / retriable-FAILED events.
      2. Resolves matching webhook_configs.
      3. Validates each destination (SSRF guard).
      4. Signs the payload with HMAC-SHA256.
      5. Delivers via HTTPS; on failure schedules exponential-backoff retry.
    """

    def __init__(self, db_pool) -> None:
        """
        Parameters
        ----------
        db_pool : asyncpg.Pool
            An asyncpg connection pool pointing at the Supabase/Postgres
            instance.
        """
        self._pool = db_pool
        self._http: Optional[httpx.AsyncClient] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> None:
        self._http = httpx.AsyncClient(
            timeout=httpx.Timeout(DELIVERY_TIMEOUT),
            follow_redirects=False,
        )
        logger.info("WebhookDispatcher started.")

    async def stop(self) -> None:
        if self._http:
            await self._http.aclose()
        logger.info("WebhookDispatcher stopped.")

    # ------------------------------------------------------------------
    # HMAC Signing
    # ------------------------------------------------------------------
    @staticmethod
    def _compute_signature(secret: str, timestamp: str, payload: str) -> str:
        """
        Compute HMAC-SHA256 over ``timestamp.payload`` using the shared
        *secret*.  Returns the hex-encoded digest.

        The signed message is ``f"{timestamp}.{payload}"`` so that
        receivers can reconstruct the same string and verify.
        """
        message = f"{timestamp}.{payload}".encode("utf-8")
        return hmac.new(
            secret.encode("utf-8"),
            message,
            hashlib.sha256,
        ).hexdigest()

    # ------------------------------------------------------------------
    # SSRF Protection
    # ------------------------------------------------------------------
    @staticmethod
    def _validate_destination(url: str) -> bool:
        """
        Resolve the hostname to an IP address and reject any private,
        reserved, loopback, or link-local addresses.

        Returns ``True`` only when the resolved IP is a public unicast
        address reachable over the Internet.
        """
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return False

        try:
            # Resolve ALL addresses (IPv4 + IPv6) for the hostname.
            infos = socket.getaddrinfo(
                hostname, parsed.port or 443, proto=socket.IPPROTO_TCP
            )
        except socket.gaierror:
            logger.warning("DNS resolution failed for %s", hostname)
            return False

        for family, _type, _proto, _canonname, sockaddr in infos:
            ip = ipaddress.ip_address(sockaddr[0])
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
                or ip.is_unspecified
            ):
                logger.warning(
                    "Destination %s resolves to non-public IP %s – blocked.",
                    url,
                    ip,
                )
                return False

        return True

    # ------------------------------------------------------------------
    # Retry Scheduling  (exponential back-off with full jitter)
    # ------------------------------------------------------------------
    @staticmethod
    def _next_retry_delay(attempt: int) -> float:
        """
        Full-jitter exponential back-off:
            t = random(0, min(T_MAX, T_BASE × 2^attempt))
        """
        ceiling = min(T_MAX, T_BASE * (2 ** attempt))
        return random.uniform(0, ceiling)

    # ------------------------------------------------------------------
    # Event Dispatch
    # ------------------------------------------------------------------
    async def dispatch_event(self, event: OutboxEvent) -> None:
        """
        Deliver *event* to every matching & active webhook_config.

        Steps:
          1. Claim the event (status → PROCESSING).
          2. Fetch matching webhook configs (target_domains overlap).
          3. For each config, validate destination → sign → POST.
          4. On success mark COMPLETED; on failure schedule retry or
             mark terminal FAILED.
        """
        assert self._http is not None, "Call start() before dispatching."

        async with self._pool.acquire() as conn:
            # ---- 1. Claim ------------------------------------------------
            await conn.execute(
                """
                UPDATE outbox_log
                   SET status     = 'PROCESSING',
                       updated_at = now()
                 WHERE id = $1
                """,
                event.id,
            )

            # ---- 2. Resolve configs --------------------------------------
            configs = await conn.fetch(
                """
                SELECT id, user_id, destination_url, secret_key,
                       target_domains, price_spread_threshold, is_active
                  FROM webhook_configs
                 WHERE is_active = true
                   AND target_domains && $1::text[]
                """,
                event.payload.get("domains", []),
            )

            if not configs:
                # No matching configs → mark complete immediately.
                await conn.execute(
                    """
                    UPDATE outbox_log
                       SET status     = 'COMPLETED',
                           updated_at = now()
                     WHERE id = $1
                    """,
                    event.id,
                )
                logger.debug("Event %d: no matching configs – marked COMPLETED.", event.id)
                return

            # ---- 3. Fan-out deliveries -----------------------------------
            all_ok = True
            for row in configs:
                cfg = WebhookConfig(**dict(row))

                if not self._validate_destination(cfg.destination_url):
                    logger.error(
                        "Event %d → config %s: SSRF check failed for %s",
                        event.id,
                        cfg.id,
                        cfg.destination_url,
                    )
                    all_ok = False
                    continue

                ts = str(int(time.time()))
                body = json.dumps(event.payload, separators=(",", ":"), sort_keys=True)
                signature = self._compute_signature(cfg.secret_key, ts, body)

                headers = {
                    "Content-Type": "application/json",
                    "X-Aegis-Signature": signature,
                    "X-Aegis-Timestamp": ts,
                    "X-Aegis-Event": event.event_type,
                }

                try:
                    resp = await self._http.post(
                        cfg.destination_url,
                        content=body,
                        headers=headers,
                    )
                    if resp.status_code >= 400:
                        logger.warning(
                            "Event %d → %s returned HTTP %d",
                            event.id,
                            cfg.destination_url,
                            resp.status_code,
                        )
                        all_ok = False
                except httpx.HTTPError as exc:
                    logger.error(
                        "Event %d → %s failed: %s",
                        event.id,
                        cfg.destination_url,
                        exc,
                    )
                    all_ok = False

            # ---- 4. Update status ----------------------------------------
            if all_ok:
                await conn.execute(
                    """
                    UPDATE outbox_log
                       SET status     = 'COMPLETED',
                           updated_at = now()
                     WHERE id = $1
                    """,
                    event.id,
                )
                logger.info("Event %d delivered successfully.", event.id)
            else:
                new_count = event.retry_count + 1
                if new_count >= MAX_RETRIES:
                    await conn.execute(
                        """
                        UPDATE outbox_log
                           SET status      = 'FAILED',
                               retry_count = $2,
                               updated_at  = now()
                         WHERE id = $1
                        """,
                        event.id,
                        new_count,
                    )
                    logger.error(
                        "Event %d exhausted all %d retries – marked terminal FAILED.",
                        event.id,
                        MAX_RETRIES,
                    )
                else:
                    delay = self._next_retry_delay(new_count)
                    retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
                    await conn.execute(
                        """
                        UPDATE outbox_log
                           SET status        = 'FAILED',
                               retry_count   = $2,
                               next_retry_at = $3,
                               updated_at    = now()
                         WHERE id = $1
                        """,
                        event.id,
                        new_count,
                        retry_at,
                    )
                    logger.info(
                        "Event %d scheduled for retry #%d in %.1fs (at %s).",
                        event.id,
                        new_count,
                        delay,
                        retry_at.isoformat(),
                    )

    # ------------------------------------------------------------------
    # Outbox Poller
    # ------------------------------------------------------------------
    async def poll_outbox(self) -> None:
        """
        Single poll cycle:
          1. SELECT … FOR UPDATE SKIP LOCKED rows that are PENDING or
             retriable FAILED (next_retry_at <= now).
          2. Dispatch each event concurrently.
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, aggregate_type, aggregate_id, event_type,
                       payload, status, retry_count, next_retry_at,
                       created_at, updated_at
                  FROM outbox_log
                 WHERE status IN ('PENDING', 'FAILED')
                   AND (next_retry_at IS NULL OR next_retry_at <= now())
                 ORDER BY id
                 LIMIT $1
                   FOR UPDATE SKIP LOCKED
                """,
                BATCH_SIZE,
            )

        if not rows:
            return

        logger.info("Polled %d actionable event(s) from outbox.", len(rows))

        tasks = []
        for row in rows:
            event = OutboxEvent(
                id=row["id"],
                aggregate_type=row["aggregate_type"],
                aggregate_id=row["aggregate_id"],
                event_type=row["event_type"],
                payload=row["payload"],
                status=row["status"],
                retry_count=row["retry_count"],
                next_retry_at=row["next_retry_at"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            tasks.append(self.dispatch_event(event))

        await asyncio.gather(*tasks, return_exceptions=True)

    # ------------------------------------------------------------------
    # Run Loop
    # ------------------------------------------------------------------
    async def run_forever(self) -> None:
        """
        Convenience entry-point: poll in an infinite loop with a sleep
        interval between cycles.
        """
        await self.start()
        try:
            while True:
                try:
                    await self.poll_outbox()
                except Exception:
                    logger.exception("Unhandled error during poll cycle.")
                await asyncio.sleep(POLL_INTERVAL)
        finally:
            await self.stop()
