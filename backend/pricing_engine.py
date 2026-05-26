"""
Jacobi Refined Econometric Pricing Analysis Engine
====================================================

Implements a multi-dimensional Price Exploitation Index (PEI) that quantifies
discriminatory pricing across geographic, technological, behavioral, and
channel segmentation axes.  Each sub-indicator is computed with robust,
non-parametric statistics (Gini coefficient, Median Absolute Deviation,
Spearman rank correlation, trimmed median) and fused into a single scalar
via Minkowski p-norm aggregation followed by sigmoid normalization.

Mathematical Framework
----------------------
Given sub-indicator vector  **I** = (I_geo, I_tech, I_behav, I_seg)  and
weight vector  **w** = (w_1, w_2, w_3, w_4):

.. math::

    Z_p = \\left(\\sum_{k=1}^{4} w_k \\, I_k^{\\,p}\\right)^{1/p}

    \\text{PEI} = \\frac{2}{1 + e^{-\\lambda \\, Z_p}} - 1

where  p  is the Minkowski norm power (default 2, i.e. Euclidean) and
λ  controls the sigmoid steepness.

Author : Jacobi Analytics Module
License: Proprietary — AegisAgent
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic result models
# ---------------------------------------------------------------------------

class RefinedSubIndicators(BaseModel):
    """Container for the four discrimination sub-indicators and their metadata."""

    geo_discrimination: float = Field(
        ...,
        description=(
            "Geographic discrimination index.  Gini coefficient of geo-segmented "
            "prices modulated by a directional penalty Φ(ρ) that amplifies "
            "regressive (income-correlated) pricing."
        ),
    )
    tech_discrimination: float = Field(
        ...,
        description=(
            "Technology / device discrimination index.  Median Absolute Deviation "
            "of device-segmented prices normalised by the median, plus a "
            "directional premium-markup component."
        ),
    )
    behavioral_discrimination: float = Field(
        ...,
        description=(
            "Behavioral discrimination index.  Fractional surplus charged to "
            "the highest-priced behavioral cohort relative to the trimmed-median "
            "baseline."
        ),
    )
    segmentation_discrimination: float = Field(
        ...,
        description=(
            "Channel segmentation discrimination index.  Gini coefficient "
            "computed across channel-level median prices."
        ),
    )
    weights: Dict[str, float] = Field(
        default_factory=lambda: {
            "geo": 0.30,
            "tech": 0.25,
            "behav": 0.25,
            "seg": 0.20,
        },
        description="Weight vector used in Minkowski aggregation.",
    )


class RefinedPEIResult(BaseModel):
    """Final output of the Jacobi Pricing Engine."""

    pei_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Composite Price Exploitation Index ∈ [0, 1].",
    )
    z_composite: float = Field(
        ...,
        description="Raw Minkowski p-norm aggregate before sigmoid mapping.",
    )
    sub_indicators: RefinedSubIndicators = Field(
        ...,
        description="Decomposed sub-indicator values.",
    )
    baseline_price: float = Field(
        ...,
        description="Trimmed-median baseline price used as the reference anchor.",
    )
    gini_overall: float = Field(
        ...,
        description="Gini coefficient computed over all observed prices.",
    )
    spearman_geo: Optional[float] = Field(
        None,
        description=(
            "Spearman ρ between geographic median prices and an implicit "
            "ordinal income proxy (rank order of medians)."
        ),
    )
    norm_power: float = Field(
        ...,
        description="Minkowski norm power p used for aggregation.",
    )
    lambda_steepness: float = Field(
        ...,
        description="Sigmoid steepness parameter λ.",
    )
    interpretation: str = Field(
        "",
        description="Human-readable interpretation of the PEI score.",
    )


# ---------------------------------------------------------------------------
# Core engine
# ---------------------------------------------------------------------------

class JacobiPricingEngine:
    """Refined econometric pricing-analysis engine.

    Parameters
    ----------
    p : float, default 2.0
        Minkowski norm power for sub-indicator aggregation.
        *  p = 1  → city-block (L₁), treats all deviations linearly.
        *  p = 2  → Euclidean (L₂), penalises larger deviations more.
        *  p → ∞  → Chebyshev (L∞), dominated by the worst axis.
    lambda_0 : float, default 5.0
        Steepness of the sigmoid normalisation  ``2 / (1 + exp(-λ·Z)) − 1``.
    trim_pct : float, default 0.1
        Fraction trimmed from each tail for the trimmed-median calculation.
    """

    # Sub-indicator weight vector (sums to 1.0)
    _DEFAULT_WEIGHTS: Dict[str, float] = {
        "geo": 0.30,
        "tech": 0.25,
        "behav": 0.25,
        "seg": 0.20,
    }

    def __init__(
        self,
        p: float = 2.0,
        lambda_0: float = 5.0,
        trim_pct: float = 0.1,
    ) -> None:
        if p < 1.0:
            raise ValueError(f"Minkowski norm power p must be ≥ 1; got {p}")
        if lambda_0 <= 0.0:
            raise ValueError(f"Sigmoid steepness λ must be > 0; got {lambda_0}")
        if not 0.0 <= trim_pct < 0.5:
            raise ValueError(f"trim_pct must be in [0, 0.5); got {trim_pct}")

        self.p: float = p
        self.lambda_0: float = lambda_0
        self.trim_pct: float = trim_pct

    # ------------------------------------------------------------------
    # Robust statistical primitives
    # ------------------------------------------------------------------

    def compute_trimmed_median(self, prices: List[float]) -> float:
        """Compute the **trimmed median** of *prices*.

        Procedure
        ---------
        1. Sort the price vector.
        2. Remove the bottom and top ``trim_pct`` fraction of observations.
        3. Return the median of the remaining (interior) values.

        The trimmed median is more resistant to outliers than the arithmetic
        mean and more stable than the raw median when the distribution is
        heavy-tailed — a common characteristic of real-world price data.

        Parameters
        ----------
        prices : List[float]
            Observed price points (must contain ≥ 1 element after trimming).

        Returns
        -------
        float
            Trimmed median value.

        Raises
        ------
        ValueError
            If the trimmed set is empty.
        """
        arr = np.sort(np.asarray(prices, dtype=np.float64))
        n = len(arr)
        k = int(n * self.trim_pct)
        trimmed = arr[k: n - k] if k > 0 else arr
        if len(trimmed) == 0:
            raise ValueError(
                "Trimmed price vector is empty — reduce trim_pct or supply more data."
            )
        return float(np.median(trimmed))

    @staticmethod
    def compute_gini(prices: List[float]) -> float:
        """Compute the **Gini coefficient** of a price distribution.

        The Gini coefficient  G ∈ [0, 1]  measures inequality:

        .. math::

            G = \\frac{\\sum_{i=1}^{n} \\sum_{j=1}^{n} |x_i - x_j|}
                 {2 \\, n \\, \\sum_{i=1}^{n} x_i}

        *  G ≈ 0  → perfect equality (all prices identical).
        *  G → 1  → maximal inequality (one price dominates).

        Parameters
        ----------
        prices : List[float]
            Non-negative price observations.

        Returns
        -------
        float
            Gini coefficient ∈ [0, 1].
        """
        arr = np.asarray(prices, dtype=np.float64)
        if len(arr) < 2:
            return 0.0
        arr = np.sort(arr)
        n = len(arr)
        total = arr.sum()
        if total == 0.0:
            return 0.0
        index = np.arange(1, n + 1, dtype=np.float64)
        gini = (2.0 * np.dot(index, arr) - (n + 1) * total) / (n * total)
        return float(np.clip(gini, 0.0, 1.0))

    @staticmethod
    def compute_mad_dispersion(prices: List[float]) -> float:
        """Compute the normalised **Median Absolute Deviation** (MAD).

        .. math::

            \\text{MAD}_{\\text{norm}} = \\frac{\\text{median}\\bigl(|x_i - \\tilde{x}|\\bigr)}{\\tilde{x}}

        where  x̃ = median(x).  The normalisation by the median makes the
        statistic scale-invariant, so it is comparable across products with
        different absolute price levels.

        Parameters
        ----------
        prices : List[float]
            Price observations.

        Returns
        -------
        float
            Normalised MAD.  Returns 0.0 when the median is zero.
        """
        arr = np.asarray(prices, dtype=np.float64)
        if len(arr) < 2:
            return 0.0
        median_val = float(np.median(arr))
        if median_val == 0.0:
            return 0.0
        mad = float(np.median(np.abs(arr - median_val)))
        return mad / median_val

    @staticmethod
    def compute_spearman(x: List[float], y: List[float]) -> float:
        """Compute the **Spearman rank-correlation** coefficient  ρ_s.

        Spearman's ρ is Pearson's r applied to the rank-transformed
        variables and is therefore robust to non-linear monotonic
        relationships and outlier contamination.

        .. math::

            \\rho_s = 1 - \\frac{6 \\sum d_i^2}{n(n^2 - 1)}

        where  d_i = \\text{rank}(x_i) - \\text{rank}(y_i).

        Parameters
        ----------
        x, y : List[float]
            Paired observations of equal length (n ≥ 2).

        Returns
        -------
        float
            Spearman ρ ∈ [−1, 1].

        Raises
        ------
        ValueError
            If *x* and *y* differ in length or have fewer than 2 elements.
        """
        if len(x) != len(y):
            raise ValueError(
                f"x and y must have the same length; got {len(x)} vs {len(y)}"
            )
        n = len(x)
        if n < 2:
            return 0.0

        def _rankdata(v: np.ndarray) -> np.ndarray:
            """Assign average ranks (handles ties)."""
            order = v.argsort()
            ranks = np.empty_like(order, dtype=np.float64)
            ranks[order] = np.arange(1, n + 1, dtype=np.float64)
            # Average ranks for tied values
            sorted_v = v[order]
            i = 0
            while i < n:
                j = i
                while j < n - 1 and sorted_v[j + 1] == sorted_v[j]:
                    j += 1
                if j > i:
                    avg_rank = np.mean(ranks[order[i: j + 1]])
                    ranks[order[i: j + 1]] = avg_rank
                i = j + 1
            return ranks

        x_arr = np.asarray(x, dtype=np.float64)
        y_arr = np.asarray(y, dtype=np.float64)
        rx = _rankdata(x_arr)
        ry = _rankdata(y_arr)

        d_sq = np.sum((rx - ry) ** 2)
        rho = 1.0 - (6.0 * d_sq) / (n * (n ** 2 - 1))
        return float(np.clip(rho, -1.0, 1.0))

    # ------------------------------------------------------------------
    # Sub-indicator calculations
    # ------------------------------------------------------------------

    def _geo_discrimination(
        self,
        prices_by_geo: Dict[str, List[float]],
    ) -> Tuple[float, Optional[float]]:
        """Geo-Discrimination sub-indicator  I_geo.

        1. Compute median price per geography.
        2. Compute Gini across those medians  → G_geo.
        3. Compute Spearman ρ between median prices and their rank-order
           (proxy for income gradient).
        4. Apply directional modifier:

        .. math::

            \\Phi(\\rho) = \\begin{cases}
                1 + \\alpha \\, |\\rho|  & \\rho > 0 \\; (\\text{regressive}) \\\\
                1 - \\gamma \\, |\\rho|  & \\rho \\le 0 \\; (\\text{progressive})
            \\end{cases}

        with  α = 1.5  (regressive penalty)  and  γ = 0.5.

        Returns  (I_geo, ρ_spearman).
        """
        alpha = 1.5  # regressive penalty amplifier
        gamma = 0.5  # progressive discount

        medians: List[float] = []
        for geo, plist in prices_by_geo.items():
            if plist:
                medians.append(float(np.median(plist)))

        if len(medians) < 2:
            return 0.0, None

        g_geo = self.compute_gini(medians)

        # Ordinal income proxy = rank order of medians themselves
        ranks = list(range(1, len(medians) + 1))
        rho = self.compute_spearman(medians, ranks)

        # Directional modifier Φ(ρ)
        if rho > 0:
            phi = 1.0 + alpha * abs(rho)
        else:
            phi = 1.0 - gamma * abs(rho)

        i_geo = g_geo * phi
        return float(np.clip(i_geo, 0.0, 1.0)), rho

    def _tech_discrimination(
        self,
        prices_by_device: Dict[str, List[float]],
        baseline: float,
    ) -> float:
        """Tech-Discrimination sub-indicator  I_tech.

        Combines normalised MAD dispersion across device-segmented prices
        with a directional premium-markup term:

        .. math::

            I_{\\text{tech}} = \\text{MAD}_{\\text{norm}} +
            \\max\\!\\left(0,\\;
            \\frac{\\max(\\tilde{x}_{\\text{dev}}) - B}{B}\\right)

        where  B  is the trimmed-median baseline.
        """
        all_device_prices: List[float] = []
        device_medians: List[float] = []
        for dev, plist in prices_by_device.items():
            if plist:
                all_device_prices.extend(plist)
                device_medians.append(float(np.median(plist)))

        if not all_device_prices or baseline == 0.0:
            return 0.0

        mad_norm = self.compute_mad_dispersion(all_device_prices)

        # Directional premium markup
        max_device_median = max(device_medians) if device_medians else baseline
        premium = max(0.0, (max_device_median - baseline) / baseline)

        i_tech = mad_norm + premium
        return float(np.clip(i_tech, 0.0, 1.0))

    @staticmethod
    def _behavioral_discrimination(
        prices_by_behavior: Dict[str, List[float]],
        baseline: float,
    ) -> float:
        """Behavioral-Discrimination sub-indicator  I_behav.

        .. math::

            I_{\\text{behav}} = \\max\\!\\left(0,\\;
            \\frac{\\max(\\tilde{x}_{\\text{behav}}) - B}{B}\\right)
        """
        if not prices_by_behavior or baseline == 0.0:
            return 0.0

        behav_medians: List[float] = []
        for seg, plist in prices_by_behavior.items():
            if plist:
                behav_medians.append(float(np.median(plist)))

        if not behav_medians:
            return 0.0

        max_behav = max(behav_medians)
        i_behav = max(0.0, (max_behav - baseline) / baseline)
        return float(np.clip(i_behav, 0.0, 1.0))

    def _segmentation_discrimination(
        self,
        prices_by_channel: Dict[str, List[float]],
    ) -> float:
        """Segmentation-Discrimination sub-indicator  I_seg.

        Gini coefficient across channel-level median prices.
        """
        channel_medians: List[float] = []
        for ch, plist in prices_by_channel.items():
            if plist:
                channel_medians.append(float(np.median(plist)))

        if len(channel_medians) < 2:
            return 0.0

        return self.compute_gini(channel_medians)

    # ------------------------------------------------------------------
    # Composite aggregation
    # ------------------------------------------------------------------

    def _minkowski_aggregate(
        self,
        indicators: List[float],
        weights: List[float],
    ) -> float:
        """Minkowski p-norm weighted aggregation.

        .. math::

            Z_p = \\left(\\sum_{k} w_k \\, I_k^{\\,p}\\right)^{1/p}

        Parameters
        ----------
        indicators : list of float
            Sub-indicator values (each ∈ [0, 1]).
        weights : list of float
            Corresponding weights (must sum to 1).

        Returns
        -------
        float
            Aggregated composite score.
        """
        total = 0.0
        for w, ind in zip(weights, indicators):
            total += w * (abs(ind) ** self.p)
        return total ** (1.0 / self.p)

    def _sigmoid_normalise(self, z: float) -> float:
        """Sigmoid normalisation mapping  Z → PEI ∈ [0, 1].

        .. math::

            \\text{PEI} = \\frac{2}{1 + e^{-\\lambda \\, Z}} - 1
        """
        exp_term = math.exp(-self.lambda_0 * z)
        return 2.0 / (1.0 + exp_term) - 1.0

    @staticmethod
    def _interpret(pei: float) -> str:
        """Return a human-readable interpretation string for a PEI score."""
        if pei < 0.15:
            return "Minimal exploitation — pricing appears largely uniform."
        elif pei < 0.35:
            return "Low exploitation — minor pricing differentials detected."
        elif pei < 0.55:
            return "Moderate exploitation — significant discriminatory pricing patterns."
        elif pei < 0.75:
            return "High exploitation — aggressive differential pricing observed."
        else:
            return "Severe exploitation — extreme discriminatory pricing across segments."

    # ------------------------------------------------------------------
    # Public API — full PEI calculation
    # ------------------------------------------------------------------

    def calculate_pei(
        self,
        prices_by_geo: Dict[str, List[float]],
        prices_by_device: Dict[str, List[float]],
        prices_by_behavior: Dict[str, List[float]],
        prices_by_channel: Dict[str, List[float]],
        all_prices: List[float],
    ) -> RefinedPEIResult:
        """Compute the composite **Price Exploitation Index** (PEI).

        Orchestrates the full pipeline:

        1. Trimmed-median baseline from *all_prices*.
        2. Four sub-indicators (geo, tech, behavioral, segmentation).
        3. Minkowski p-norm weighted aggregation  → Z_p.
        4. Sigmoid normalisation  → PEI ∈ [0, 1].

        Parameters
        ----------
        prices_by_geo : Dict[str, List[float]]
            Mapping of geographic segment label → observed prices.
        prices_by_device : Dict[str, List[float]]
            Mapping of device / platform label → observed prices.
        prices_by_behavior : Dict[str, List[float]]
            Mapping of behavioral cohort label → observed prices.
        prices_by_channel : Dict[str, List[float]]
            Mapping of sales channel label → observed prices.
        all_prices : List[float]
            Flat vector of every observed price (union of all segments).

        Returns
        -------
        RefinedPEIResult
            Complete result object containing the PEI score, composite
            Z value, all sub-indicators, baseline, and interpretation.

        Raises
        ------
        ValueError
            If *all_prices* is empty or yields an empty trimmed set.

        Examples
        --------
        >>> engine = JacobiPricingEngine(p=2.0, lambda_0=5.0, trim_pct=0.1)
        >>> result = engine.calculate_pei(
        ...     prices_by_geo={"US": [100, 105], "IN": [60, 65]},
        ...     prices_by_device={"iOS": [110, 115], "Android": [95, 100]},
        ...     prices_by_behavior={"loyal": [100], "new": [120]},
        ...     prices_by_channel={"web": [100], "app": [110]},
        ...     all_prices=[100, 105, 60, 65, 110, 115, 95, 100, 120, 110],
        ... )
        >>> 0.0 <= result.pei_score <= 1.0
        True
        """
        if not all_prices:
            raise ValueError("all_prices must be a non-empty list.")

        # 1. Baseline
        baseline = self.compute_trimmed_median(all_prices)

        # 2. Sub-indicators
        i_geo, rho_geo = self._geo_discrimination(prices_by_geo)
        i_tech = self._tech_discrimination(prices_by_device, baseline)
        i_behav = self._behavioral_discrimination(prices_by_behavior, baseline)
        i_seg = self._segmentation_discrimination(prices_by_channel)

        # 3. Minkowski aggregation
        weights = self._DEFAULT_WEIGHTS
        w_vec = [weights["geo"], weights["tech"], weights["behav"], weights["seg"]]
        i_vec = [i_geo, i_tech, i_behav, i_seg]
        z_p = self._minkowski_aggregate(i_vec, w_vec)

        # 4. Sigmoid normalisation
        pei = self._sigmoid_normalise(z_p)

        # 5. Overall Gini (informational)
        gini_all = self.compute_gini(all_prices)

        # 6. Assemble result
        sub = RefinedSubIndicators(
            geo_discrimination=round(i_geo, 6),
            tech_discrimination=round(i_tech, 6),
            behavioral_discrimination=round(i_behav, 6),
            segmentation_discrimination=round(i_seg, 6),
            weights=weights,
        )

        result = RefinedPEIResult(
            pei_score=round(float(np.clip(pei, 0.0, 1.0)), 6),
            z_composite=round(z_p, 6),
            sub_indicators=sub,
            baseline_price=round(baseline, 4),
            gini_overall=round(gini_all, 6),
            spearman_geo=round(rho_geo, 6) if rho_geo is not None else None,
            norm_power=self.p,
            lambda_steepness=self.lambda_0,
            interpretation=self._interpret(pei),
        )

        return result
