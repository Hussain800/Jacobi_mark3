"""Jacobi Compare — open-source price optimization core (pivot MVP).

Consumer-default pipeline (PDR: docs/PDR_OPEN_SOURCE_PRICE_OPTIMIZATION.md):

    current page context -> exact product identity -> candidate offers
    -> equivalence classification -> all-in total cost -> filter-first ranking
    -> verified saving (or honest uncertainty)

Zero mandatory collection cost: fixture + local adapters only. Bright Data and
the 24/50-agent synthetic matrix are NOT called from this package — the legacy
probe engine remains available separately as the optional Deep Audit.
"""
