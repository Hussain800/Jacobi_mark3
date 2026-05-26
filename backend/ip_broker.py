"""
jacobi.ip_broker
~~~~~~~~~~~~~~~~

Client-Side IP Reputation Broker for the Jacobi proxy infrastructure.

Maintains a per-IP reputation ledger with exponential time-decay recovery
and a per-agent session versioning registry for deterministic BrightData
session string generation.

Reputation Model
----------------
Each proxy IP carries a reputation score R_i(t) ∈ [0, 100].

*   **Recovery** follows first-order exponential relaxation toward the
    ceiling of 100:

        R_recovered = R_old + (100 - R_old) · (1 − exp(−λ · Δt))

    where λ = ln(2) / 300  (≈ half-life of 300 s).

*   **Penalty allocations** are subtracted *after* recovery is applied:

    +-----------------+----------+
    | Event           | Penalty  |
    +-----------------+----------+
    | timeout         |   15     |
    | http_5xx        |   10     |
    | http_429        |   30     |
    | http_403_captcha|   50     |
    +-----------------+----------+

*   A successful request grants a **+5 bonus** (clamped to 100).

*   An IP is **usable** when its score ≥ 50.

*   An IP enters the **blacklist** when its score drops below 50.
    It remains blacklisted for a TTL of 600 s *and* until its
    recovered score crosses the **hysteresis release threshold** of 80.

Session Model
-------------
Each ``(agent_id)`` maps to a monotonically increasing version counter.
``get_session_string`` formats this into a BrightData-compatible session
identifier:

    brd-customer-{customer_id}-zone-{zone}-session-agent_{agent_id}_v{version}

``rotate_session`` increments the version, forcing the upstream proxy
provider to allocate a fresh egress IP on the next request.
"""

from __future__ import annotations

import logging
import math
import time
from typing import Dict, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------
logger = logging.getLogger("jacobi.ip_broker")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_LAMBDA: float = math.log(2) / 300.0
"""Decay constant λ = ln(2)/300 → half-life ≈ 300 s."""

_PENALTY_MAP: Dict[str, float] = {
    "timeout": 15.0,
    "http_5xx": 10.0,
    "http_429": 30.0,
    "http_403_captcha": 50.0,
}

_SUCCESS_BONUS: float = 5.0
_USABILITY_THRESHOLD: float = 50.0
_HYSTERESIS_RELEASE: float = 80.0
_BLACKLIST_TTL: float = 600.0  # seconds


# ---------------------------------------------------------------------------
# Pydantic Data Models
# ---------------------------------------------------------------------------
class IPRecord(BaseModel):
    """Persistent reputation record for a single proxy IP address.

    Attributes:
        ip: The IPv4/IPv6 address string.
        score: Current raw reputation score in [0, 100].
        last_update: Unix epoch timestamp of the most recent score mutation.
        blacklisted: Whether the IP is currently on the blacklist.
        blacklist_ts: Unix epoch timestamp when the IP was blacklisted.
            ``None`` if never blacklisted or after release.
        total_successes: Lifetime count of successful requests through this IP.
        total_failures: Lifetime count of failed requests through this IP.
    """

    ip: str
    score: float = Field(default=100.0, ge=0.0, le=100.0)
    last_update: float = Field(default_factory=time.time)
    blacklisted: bool = False
    blacklist_ts: Optional[float] = None
    total_successes: int = 0
    total_failures: int = 0


class SessionRecord(BaseModel):
    """Versioned session state for a single scraping agent.

    Attributes:
        agent_id: Unique identifier for the agent.
        version: Monotonically increasing session version counter.
        created_at: Unix epoch timestamp of record creation.
        last_rotated: Unix epoch timestamp of the most recent rotation.
    """

    agent_id: str
    version: int = Field(default=1, ge=1)
    created_at: float = Field(default_factory=time.time)
    last_rotated: float = Field(default_factory=time.time)


# ---------------------------------------------------------------------------
# IPReputationBroker
# ---------------------------------------------------------------------------
class IPReputationBroker:
    """Client-side IP reputation broker with exponential recovery and
    hysteresis-gated blacklist release.

    The broker is **not** thread-safe; callers operating across threads
    must serialise access externally (e.g. via ``asyncio.Lock`` or
    ``threading.Lock``).

    Parameters:
        usability_threshold: Minimum score for ``check_ip`` to return
            ``True``.  Defaults to 50.
        hysteresis_release: Recovered score required to exit the
            blacklist.  Defaults to 80.
        blacklist_ttl: Minimum seconds an IP must remain blacklisted
            regardless of score recovery.  Defaults to 600.

    Example::

        broker = IPReputationBroker()

        if broker.check_ip("1.2.3.4"):
            # … issue request via proxy …
            broker.record_result("1.2.3.4", success=True)
        else:
            broker.record_result("1.2.3.4", success=False,
                                 failure_type="http_429")
    """

    # ------------------------------------------------------------------ #
    #  Construction
    # ------------------------------------------------------------------ #
    def __init__(
        self,
        *,
        usability_threshold: float = _USABILITY_THRESHOLD,
        hysteresis_release: float = _HYSTERESIS_RELEASE,
        blacklist_ttl: float = _BLACKLIST_TTL,
    ) -> None:
        self._registry: Dict[str, IPRecord] = {}
        self._session_registry: Dict[str, SessionRecord] = {}

        self._usability_threshold = usability_threshold
        self._hysteresis_release = hysteresis_release
        self._blacklist_ttl = blacklist_ttl

        logger.info(
            "IPReputationBroker initialised  "
            "(threshold=%.1f, hysteresis=%.1f, blacklist_ttl=%.0fs)",
            self._usability_threshold,
            self._hysteresis_release,
            self._blacklist_ttl,
        )

    # ------------------------------------------------------------------ #
    #  Internal helpers
    # ------------------------------------------------------------------ #
    def _ensure_record(self, ip: str) -> IPRecord:
        """Return the existing ``IPRecord`` for *ip*, creating one at
        score 100 if none exists."""
        if ip not in self._registry:
            self._registry[ip] = IPRecord(ip=ip)
            logger.debug("Created new IPRecord for %s", ip)
        return self._registry[ip]

    @staticmethod
    def _apply_recovery(record: IPRecord, now: float) -> float:
        """Compute the recovered score using first-order exponential
        relaxation and return the updated value.

        The formula:

            R_recovered = R_old + (100 - R_old) · (1 − exp(−λ · Δt))

        Parameters:
            record: The ``IPRecord`` whose score is being recovered.
            now: Current Unix epoch timestamp.

        Returns:
            The recovered score (not yet clamped or penalised).
        """
        elapsed: float = max(now - record.last_update, 0.0)
        if elapsed <= 0.0:
            return record.score

        recovery = (100.0 - record.score) * (1.0 - math.exp(-_LAMBDA * elapsed))
        recovered_score = record.score + recovery
        return min(recovered_score, 100.0)

    def _try_release_blacklist(self, record: IPRecord, now: float) -> None:
        """Attempt to release *record* from the blacklist.

        Release requires **both** conditions:

        1. The blacklist TTL has elapsed (``now − blacklist_ts ≥ TTL``).
        2. The (already-recovered) score meets the hysteresis release
           threshold.
        """
        if not record.blacklisted:
            return

        ttl_elapsed = (
            record.blacklist_ts is not None
            and (now - record.blacklist_ts) >= self._blacklist_ttl
        )
        score_sufficient = record.score >= self._hysteresis_release

        if ttl_elapsed and score_sufficient:
            record.blacklisted = False
            record.blacklist_ts = None
            logger.info(
                "IP %s released from blacklist (score=%.2f)", record.ip, record.score
            )

    # ------------------------------------------------------------------ #
    #  Public API
    # ------------------------------------------------------------------ #
    def check_ip(self, ip: str) -> bool:
        """Determine whether *ip* is currently usable.

        Applies time-decay recovery before evaluating and attempts a
        blacklist release if applicable.

        Parameters:
            ip: IPv4 or IPv6 address string.

        Returns:
            ``True`` if the IP's effective score is **≥ usability
            threshold** (default 50) and the IP is **not** blacklisted;
            ``False`` otherwise.
        """
        now = time.time()
        record = self._ensure_record(ip)

        # Apply passive recovery
        record.score = self._apply_recovery(record, now)
        record.last_update = now

        # Attempt blacklist release
        self._try_release_blacklist(record, now)

        usable = (not record.blacklisted) and (
            record.score >= self._usability_threshold
        )
        logger.debug(
            "check_ip(%s) → %s  (score=%.2f, blacklisted=%s)",
            ip,
            usable,
            record.score,
            record.blacklisted,
        )
        return usable

    def record_result(
        self,
        ip: str,
        success: bool,
        failure_type: Optional[str] = None,
    ) -> None:
        """Record the outcome of a request routed through *ip* and
        update its reputation score.

        On **success**, a fixed bonus of +5 is applied (clamped to 100).
        On **failure**, the penalty corresponding to *failure_type* is
        subtracted (clamped to 0). If the resulting score falls below
        the usability threshold the IP is blacklisted.

        Parameters:
            ip: IPv4 or IPv6 address string.
            success: ``True`` if the request succeeded.
            failure_type: One of ``"timeout"``, ``"http_5xx"``,
                ``"http_429"``, ``"http_403_captcha"``.  Required when
                ``success`` is ``False``; ignored otherwise.

        Raises:
            ValueError: If ``success`` is ``False`` and *failure_type*
                is not a recognised penalty category.
        """
        now = time.time()
        record = self._ensure_record(ip)

        # Step 1: passive recovery
        record.score = self._apply_recovery(record, now)

        # Step 2: apply event delta
        if success:
            record.score = min(record.score + _SUCCESS_BONUS, 100.0)
            record.total_successes += 1
            logger.debug(
                "IP %s  success  → score=%.2f", ip, record.score
            )
        else:
            if failure_type is None or failure_type not in _PENALTY_MAP:
                raise ValueError(
                    f"Unknown or missing failure_type: {failure_type!r}. "
                    f"Must be one of {list(_PENALTY_MAP.keys())}."
                )
            penalty = _PENALTY_MAP[failure_type]
            record.score = max(record.score - penalty, 0.0)
            record.total_failures += 1
            logger.warning(
                "IP %s  failure(%s, −%.0f) → score=%.2f",
                ip,
                failure_type,
                penalty,
                record.score,
            )

        record.last_update = now

        # Step 3: blacklist evaluation
        if record.score < self._usability_threshold and not record.blacklisted:
            record.blacklisted = True
            record.blacklist_ts = now
            logger.warning("IP %s blacklisted (score=%.2f)", ip, record.score)

        # Step 4: attempt release (edge case: bonus pushed score above
        # hysteresis while already blacklisted and TTL elapsed)
        self._try_release_blacklist(record, now)

    # ------------------------------------------------------------------ #
    #  Session management
    # ------------------------------------------------------------------ #
    def get_session_string(
        self, agent_id: str, customer_id: str, zone: str
    ) -> str:
        """Build a BrightData-compatible session identifier.

        Format::

            brd-customer-{customer_id}-zone-{zone}-session-agent_{agent_id}_v{version}

        If no ``SessionRecord`` exists for *agent_id*, one is created
        with ``version=1``.

        Parameters:
            agent_id: Unique scraping-agent identifier.
            customer_id: BrightData customer account ID.
            zone: BrightData proxy zone name.

        Returns:
            Fully formatted session string.
        """
        if agent_id not in self._session_registry:
            self._session_registry[agent_id] = SessionRecord(agent_id=agent_id)
            logger.debug("Created SessionRecord for agent %s", agent_id)

        session = self._session_registry[agent_id]
        session_string = (
            f"brd-customer-{customer_id}-zone-{zone}"
            f"-session-agent_{agent_id}_v{session.version}"
        )
        logger.debug("Session string for agent %s: %s", agent_id, session_string)
        return session_string

    def rotate_session(self, agent_id: str) -> None:
        """Increment the session version counter for *agent_id*,
        forcing a fresh egress IP allocation on the next upstream
        request.

        If no ``SessionRecord`` exists for *agent_id*, one is created
        at ``version=1`` and then immediately incremented to ``version=2``.

        Parameters:
            agent_id: Unique scraping-agent identifier.
        """
        now = time.time()
        if agent_id not in self._session_registry:
            self._session_registry[agent_id] = SessionRecord(agent_id=agent_id)

        session = self._session_registry[agent_id]
        old_version = session.version
        session.version += 1
        session.last_rotated = now

        logger.info(
            "Rotated session for agent %s: v%d → v%d",
            agent_id,
            old_version,
            session.version,
        )

    # ------------------------------------------------------------------ #
    #  Diagnostics
    # ------------------------------------------------------------------ #
    def get_record(self, ip: str) -> Optional[IPRecord]:
        """Return the ``IPRecord`` for *ip*, or ``None`` if untracked.

        This is a **read-only snapshot**; it does *not* apply recovery.
        Use ``check_ip`` for an up-to-date usability determination.
        """
        return self._registry.get(ip)

    def get_all_records(self) -> Dict[str, IPRecord]:
        """Return a shallow copy of the full IP registry."""
        return dict(self._registry)

    def get_session_record(self, agent_id: str) -> Optional[SessionRecord]:
        """Return the ``SessionRecord`` for *agent_id*, or ``None``."""
        return self._session_registry.get(agent_id)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<IPReputationBroker  "
            f"ips={len(self._registry)}  "
            f"sessions={len(self._session_registry)}>"
        )
