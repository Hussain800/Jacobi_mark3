"""Hermetic benchmark harness for the deterministic offer ranker.

The command reports timings measured in the current process; it contains no
claimed target or precomputed performance number::

    python -m compare.benchmark --iterations 500 --json
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from decimal import Decimal
import json
import math
from time import perf_counter
from typing import Callable, Dict, List

from .ranking import rank
from .schemas import (
    Condition,
    EquivalenceClass,
    EquivalenceResult,
    Money,
    OfferObservation,
    PreferenceMode,
    PriceBreakdown,
    ProductIdentity,
    Seller,
    SellerType,
    StockStatus,
)


@dataclass(frozen=True)
class BenchmarkResult:
    operation: str
    iterations: int
    warmup_iterations: int
    min_ms: float
    median_ms: float
    p95_ms: float
    max_ms: float
    measured_at: str

    def as_dict(self) -> Dict[str, object]:
        return asdict(self)


def _percentile(samples: List[float], percentile: float) -> float:
    ordered = sorted(samples)
    index = max(0, math.ceil(percentile * len(ordered)) - 1)
    return ordered[index]


def measure(
    operation: str,
    function: Callable[[], object],
    *,
    iterations: int = 100,
    warmup_iterations: int = 5,
) -> BenchmarkResult:
    """Measure an operation without applying environment-specific thresholds."""

    if iterations < 1:
        raise ValueError("iterations must be positive")
    if warmup_iterations < 0:
        raise ValueError("warmup_iterations cannot be negative")
    for _ in range(warmup_iterations):
        function()
    samples: List[float] = []
    for _ in range(iterations):
        started = perf_counter()
        function()
        samples.append((perf_counter() - started) * 1_000)
    ordered = sorted(samples)
    middle = len(ordered) // 2
    median = (
        ordered[middle]
        if len(ordered) % 2
        else (ordered[middle - 1] + ordered[middle]) / 2
    )
    return BenchmarkResult(
        operation=operation,
        iterations=iterations,
        warmup_iterations=warmup_iterations,
        min_ms=round(ordered[0], 6),
        median_ms=round(median, 6),
        p95_ms=round(_percentile(samples, 0.95), 6),
        max_ms=round(ordered[-1], 6),
        measured_at=datetime.now(timezone.utc).isoformat(),
    )


def _complete_price(amount: Decimal) -> PriceBreakdown:
    money = Money(amount=amount, currency="AED")
    return PriceBreakdown(
        item=money,
        shipping=Money(amount="0", currency="AED"),
        payable_total=money,
        total_complete=True,
    )


def benchmark_ranking(
    *,
    iterations: int = 100,
    warmup_iterations: int = 5,
    candidate_count: int = 25,
) -> BenchmarkResult:
    """Measure ranking a fixed set of valid, complete offers with no I/O."""

    if candidate_count < 1:
        raise ValueError("candidate_count must be positive")
    benchmark_now = datetime.now(timezone.utc)
    identity = ProductIdentity(brand="Sony", model="WH-1000XM6", identity_confidence=0.99)
    current = OfferObservation(
        observation_id="benchmark-current",
        merchant_id="current",
        merchant_name="Current",
        source_url="https://benchmark.invalid/current",
        observed_at=benchmark_now,
        product=identity,
        seller=Seller(type=SellerType.first_party, legitimate=True),
        price=_complete_price(Decimal("1699")),
        condition=Condition.new,
        stock=StockStatus.in_stock,
    )
    equivalence = EquivalenceResult(
        classification=EquivalenceClass.exact,
        score=0.99,
        explanation="Hermetic exact-equivalence benchmark fixture.",
    )
    candidates = []
    for index in range(candidate_count):
        offer = OfferObservation(
            observation_id=f"benchmark-{index:04d}",
            merchant_id=f"merchant-{index:04d}",
            merchant_name=f"Merchant {index:04d}",
            source_url=f"https://benchmark.invalid/{index}",
            observed_at=benchmark_now,
            product=identity,
            seller=Seller(
                type=SellerType.official_store if index % 5 == 0 else SellerType.marketplace,
                trust_score=0.8,
                legitimate=True,
            ),
            price=_complete_price(Decimal("1200") + index),
            condition=Condition.new,
            stock=StockStatus.in_stock,
            extraction_confidence=0.95,
            evidence_tier="fixture",
            fixture=True,
        )
        candidates.append((offer, equivalence))

    return measure(
        f"rank_{candidate_count}_offers",
        lambda: rank(
            current,
            candidates,
            now=benchmark_now,
            preference_mode=PreferenceMode.balanced,
        ),
        iterations=iterations,
        warmup_iterations=warmup_iterations,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure Jacobi's hermetic offer ranker")
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--warmups", type=int, default=5)
    parser.add_argument("--candidates", type=int, default=25)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = benchmark_ranking(
        iterations=args.iterations,
        warmup_iterations=args.warmups,
        candidate_count=args.candidates,
    )
    if args.json:
        print(json.dumps(result.as_dict(), sort_keys=True))
    else:
        print(
            f"{result.operation}: median={result.median_ms:.6f} ms, "
            f"p95={result.p95_ms:.6f} ms ({result.iterations} measured iterations)"
        )


if __name__ == "__main__":
    main()
