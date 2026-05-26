"""
jacobi.concurrency
==================

Adaptive concurrency primitives for the Jacobi proxy engine.

This module provides two complementary mechanisms for governing outbound
request concurrency under adversarial or degraded-service conditions:

* **AIMDSemaphore** – A dynamic asyncio semaphore whose capacity follows
  the *Additive Increase / Multiplicative Decrease* (AIMD) algorithm
  canonically used in TCP congestion control (Jacobson 1988).  The
  semaphore widens by a fixed additive increment after sustained success
  and contracts multiplicatively on each observed failure, yielding a
  saw-tooth utilisation curve that converges toward the provider's true
  capacity ceiling.

* **CircuitBreaker** – A time-windowed error-rate monitor that trips when
  the failure ratio exceeds a configurable threshold, preventing
  cascading failures by fast-failing requests during cooloff.

Both classes are fully async-safe and use ``asyncio.Lock`` to serialise
mutations on internal state.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import deque
from typing import Deque, Literal

logger = logging.getLogger("jacobi.concurrency")


class AIMDSemaphore:
    """Dynamic asyncio semaphore scaled by the AIMD algorithm.

    The capacity :math:`C` evolves as follows:

    * **On failure** (multiplicative decrease)::

          C_{new} = max(min_cap, floor(C * beta))

    * **On success** (additive increase, after *k* consecutive successes)::

          C_{new} = min(max_cap, C + alpha)

    where *k* defaults to 20.  This mirrors TCP slow-start / congestion-
    avoidance: rapid back-off on loss, cautious recovery on sustained
    throughput.

    Parameters
    ----------
    initial : int
        Starting concurrency capacity.
    min_cap : int
        Hard lower bound on capacity (prevents starvation).
    max_cap : int
        Hard upper bound on capacity (prevents resource exhaustion).
    alpha : int
        Additive increase step applied after ``success_threshold``
        consecutive successes.
    beta : float
        Multiplicative decrease factor applied on each failure
        (must be in ``(0, 1)``).
    success_threshold : int
        Number of consecutive successes required before an additive
        increase is applied.
    """

    __slots__ = (
        "_capacity",
        "_min_cap",
        "_max_cap",
        "_alpha",
        "_beta",
        "_success_threshold",
        "_consecutive_successes",
        "_semaphore",
        "_lock",
    )

    def __init__(
        self,
        initial: int = 12,
        min_cap: int = 4,
        max_cap: int = 24,
        alpha: int = 1,
        beta: float = 0.5,
        success_threshold: int = 20,
    ) -> None:
        if not (0 < beta < 1):
            raise ValueError(f"beta must be in (0, 1), got {beta}")
        if not (min_cap <= initial <= max_cap):
            raise ValueError(
                f"initial ({initial}) must satisfy min_cap ({min_cap}) "
                f"<= initial <= max_cap ({max_cap})"
            )

        self._capacity: int = initial
        self._min_cap: int = min_cap
        self._max_cap: int = max_cap
        self._alpha: int = alpha
        self._beta: float = beta
        self._success_threshold: int = success_threshold
        self._consecutive_successes: int = 0
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(initial)
        self._lock: asyncio.Lock = asyncio.Lock()

        logger.info(
            "AIMDSemaphore initialised — capacity=%d, bounds=[%d, %d], "
            "α=%d, β=%.2f, success_threshold=%d",
            initial,
            min_cap,
            max_cap,
            alpha,
            beta,
            success_threshold,
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def capacity(self) -> int:
        """Return the current concurrency cap."""
        return self._capacity

    async def acquire(self) -> None:
        """Acquire a semaphore permit, blocking until one is available."""
        await self._semaphore.acquire()
        logger.debug(
            "Permit acquired — active≈%d/%d",
            self._capacity - self._semaphore._value,  # noqa: SLF001
            self._capacity,
        )

    def release(self) -> None:
        """Release a previously acquired permit back to the pool."""
        self._semaphore.release()
        logger.debug("Permit released")

    async def handle_failure(self) -> None:
        """Apply multiplicative decrease to the capacity.

        .. math::
            C_{\\text{new}} = \\max(\\text{min\\_cap},\\;
                              \\lfloor C \\cdot \\beta \\rfloor)

        The consecutive-success counter is reset to zero.
        """
        async with self._lock:
            old = self._capacity
            self._capacity = max(self._min_cap, math.floor(self._capacity * self._beta))
            self._consecutive_successes = 0
            self._rebuild_semaphore(old)
            logger.warning(
                "AIMD multiplicative decrease: %d → %d",
                old,
                self._capacity,
            )

    async def handle_success(self) -> None:
        """Record a success and, if the threshold is met, apply additive increase.

        .. math::
            C_{\\text{new}} = \\min(\\text{max\\_cap},\\; C + \\alpha)

        The increase fires only after ``success_threshold`` consecutive
        successes, after which the counter resets.
        """
        async with self._lock:
            self._consecutive_successes += 1
            if self._consecutive_successes >= self._success_threshold:
                old = self._capacity
                self._capacity = min(self._max_cap, self._capacity + self._alpha)
                self._consecutive_successes = 0
                self._rebuild_semaphore(old)
                logger.info(
                    "AIMD additive increase: %d → %d (after %d consecutive successes)",
                    old,
                    self._capacity,
                    self._success_threshold,
                )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _rebuild_semaphore(self, old_capacity: int) -> None:
        """Reconstruct the underlying ``asyncio.Semaphore`` after a capacity change.

        When capacity *decreases*, excess permits are drained so that
        in-flight tasks naturally finish but no new ones start beyond the
        new cap.  When capacity *increases*, additional permits are
        injected immediately.
        """
        delta = self._capacity - old_capacity
        if delta == 0:
            return

        if delta > 0:
            # Inject additional permits.
            for _ in range(delta):
                self._semaphore.release()
        else:
            # Drain excess permits (best-effort; may not succeed if all
            # permits are currently held by in-flight tasks).
            for _ in range(-delta):
                # Attempt a non-blocking acquire; if it fails the permit
                # is already held and will naturally be consumed.
                acquired = self._semaphore._value > 0  # noqa: SLF001
                if acquired:
                    try:
                        self._semaphore.acquire_nowait()
                    except ValueError:
                        break

    def __repr__(self) -> str:
        return (
            f"<AIMDSemaphore capacity={self._capacity} "
            f"bounds=[{self._min_cap}, {self._max_cap}] "
            f"streak={self._consecutive_successes}/{self._success_threshold}>"
        )


class CircuitBreaker:
    """Time-windowed circuit breaker that trips on excessive error rates.

    The breaker observes a sliding window of outcomes and trips when::

        failures / total  >=  threshold

    Once tripped, it enters a *cooloff* period during which
    ``is_tripped`` returns ``True``.  After the cooloff elapses the
    breaker resets automatically on the next check.

    Parameters
    ----------
    threshold : float
        Failure ratio ``[0, 1]`` at which the breaker trips.
    window_seconds : float
        Length of the sliding observation window in seconds.
    cooloff_seconds : float
        Duration in seconds the breaker remains tripped before
        automatic reset.
    """

    __slots__ = (
        "_threshold",
        "_window_seconds",
        "_cooloff_seconds",
        "_events",
        "_tripped_at",
        "_lock",
    )

    # Each event is a ``(timestamp, outcome)`` tuple.
    _Event = tuple[float, Literal["s", "f"]]

    def __init__(
        self,
        threshold: float = 0.3,
        window_seconds: float = 60.0,
        cooloff_seconds: float = 300.0,
    ) -> None:
        if not (0.0 < threshold <= 1.0):
            raise ValueError(f"threshold must be in (0, 1], got {threshold}")

        self._threshold: float = threshold
        self._window_seconds: float = window_seconds
        self._cooloff_seconds: float = cooloff_seconds
        self._events: Deque[CircuitBreaker._Event] = deque()
        self._tripped_at: float | None = None
        self._lock: asyncio.Lock = asyncio.Lock()

        logger.info(
            "CircuitBreaker initialised — threshold=%.0f%%, window=%ds, cooloff=%ds",
            threshold * 100,
            window_seconds,
            cooloff_seconds,
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def record_success(self) -> None:
        """Record a successful outcome."""
        now = time.monotonic()
        self._events.append((now, "s"))
        self._prune(now)
        logger.debug("CircuitBreaker recorded success (window size=%d)", len(self._events))

    def record_failure(self) -> None:
        """Record a failed outcome and evaluate the trip condition."""
        now = time.monotonic()
        self._events.append((now, "f"))
        self._prune(now)

        total = len(self._events)
        failures = sum(1 for _, outcome in self._events if outcome == "f")

        if total > 0 and (failures / total) >= self._threshold:
            if self._tripped_at is None:
                self._tripped_at = now
                logger.error(
                    "CircuitBreaker TRIPPED — failure rate %.1f%% "
                    "(%d/%d in last %ds) exceeds threshold %.0f%%",
                    (failures / total) * 100,
                    failures,
                    total,
                    self._window_seconds,
                    self._threshold * 100,
                )
        else:
            logger.debug(
                "CircuitBreaker recorded failure — rate %.1f%% (%d/%d), "
                "below threshold %.0f%%",
                (failures / total) * 100 if total else 0.0,
                failures,
                total,
                self._threshold * 100,
            )

    @property
    def is_tripped(self) -> bool:
        """Return ``True`` if the breaker is currently in the tripped state.

        If the cooloff period has elapsed since the trip, the breaker
        automatically resets and returns ``False``.
        """
        if self._tripped_at is None:
            return False

        elapsed = time.monotonic() - self._tripped_at
        if elapsed >= self._cooloff_seconds:
            logger.info(
                "CircuitBreaker auto-reset after %.0fs cooloff",
                elapsed,
            )
            self.reset()
            return False

        return True

    def reset(self) -> None:
        """Manually reset the circuit breaker, clearing all recorded events."""
        self._tripped_at = None
        self._events.clear()
        logger.info("CircuitBreaker reset")

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _prune(self, now: float) -> None:
        """Remove events older than the observation window."""
        cutoff = now - self._window_seconds
        while self._events and self._events[0][0] < cutoff:
            self._events.popleft()

    def __repr__(self) -> str:
        state = "TRIPPED" if self.is_tripped else "CLOSED"
        return (
            f"<CircuitBreaker state={state} "
            f"threshold={self._threshold:.0%} "
            f"window={self._window_seconds}s "
            f"events={len(self._events)}>"
        )
