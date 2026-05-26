"""
Savings verdict engine for Jacobi pricing probe results.
Computes actionable savings opportunities from gradient data.
"""

from typing import Dict, List, Optional, Tuple


def compute_savings_verdict(probe_data: dict) -> dict:
    """
    Compute a savings verdict from probe data.

    Returns a structured dict with:
    - total_potential_savings: max $ the consumer could save
    - cheapest_achievable_price: lowest price found
    - opportunities: list of actionable savings by variable
    - savings_by_method: dict of method -> savings amount
    - severity: mild/moderate/severe
    """
    if not probe_data:
        return {
            "total_potential_savings": 0,
            "cheapest_achievable_price": 0,
            "most_expensive_price": 0,
            "baseline_price": 0,
            "cheapest_label": "Unknown",
            "is_discriminating": False,
            "severity": "none",
            "opportunities": [],
            "savings_by_method": {},
            "discrimination_score": 0,
        }

    gradients = probe_data.get("gradients", [])
    baseline = probe_data.get("baseline_price", 0) or 0
    agents = probe_data.get("agents", [])

    valid_agents = [a for a in agents if a.get("price") is not None]
    cheapest = min(valid_agents, key=lambda a: a["price"]) if valid_agents else None
    most_expensive = max(valid_agents, key=lambda a: a["price"]) if valid_agents else None

    sig_gradients = {g["variable_name"]: g for g in gradients if g.get("significant")}

    max_savings = (most_expensive["price"] - cheapest["price"]) if cheapest and most_expensive else 0

    opportunities = []
    savings_by_method = {}

    # Location (VPN)
    loc = sig_gradients.get("location")
    if loc and loc["delta"] > 5:
        savings_by_method["vpn"] = round(loc["delta"], 2)
        opportunities.append({
            "method": "vpn",
            "description": f"Browse from a different location (VPN to {loc['state_low']})",
            "savings": round(loc["delta"], 2),
            "savings_pct": round(loc["delta_pct"], 1),
            "difficulty": "easy",
            "confidence": 0.9,
        })

    # Device
    dev = sig_gradients.get("device")
    if dev and dev["delta"] > 5:
        savings_by_method["device"] = round(dev["delta"], 2)
        opportunities.append({
            "method": "device",
            "description": f"Use a {dev['state_low']} device instead of {dev['state_high']}",
            "savings": round(dev["delta"], 2),
            "savings_pct": round(dev["delta_pct"], 1),
            "difficulty": "easy",
            "confidence": 0.9,
        })

    # Cookie
    ck = sig_gradients.get("cookie_profile")
    if ck and ck["delta"] > 5:
        savings_by_method["cookie"] = round(ck["delta"], 2)
        opportunities.append({
            "method": "cookie",
            "description": "Clear browser cookies or use incognito mode",
            "savings": round(ck["delta"], 2),
            "savings_pct": round(ck["delta_pct"], 1),
            "difficulty": "easy",
            "confidence": 0.9,
        })

    # Referrer
    ref = sig_gradients.get("referrer")
    if ref and ref["delta"] > 5:
        savings_by_method["referrer"] = round(ref["delta"], 2)
        opportunities.append({
            "method": "referrer",
            "description": f"Book via {ref['state_low']} instead of {ref['state_high']}",
            "savings": round(ref["delta"], 2),
            "savings_pct": round(ref["delta_pct"], 1),
            "difficulty": "medium",
            "confidence": 0.9,
        })

    # Sort by savings amount descending
    opportunities.sort(key=lambda o: o["savings"], reverse=True)

    # Severity
    spread_pct = probe_data.get("max_price_spread_pct", 0) or 0
    sig_count = len(sig_gradients)
    if sig_count == 0 or spread_pct < 3:
        severity = "none"
        is_discriminating = False
    elif spread_pct < 10:
        severity = "mild"
        is_discriminating = True
    elif spread_pct < 20:
        severity = "moderate"
        is_discriminating = True
    else:
        severity = "severe"
        is_discriminating = True

    return {
        "total_potential_savings": round(max_savings, 2),
        "cheapest_achievable_price": round(cheapest["price"], 2) if cheapest else 0,
        "most_expensive_price": round(most_expensive["price"], 2) if most_expensive else 0,
        "baseline_price": round(baseline, 2),
        "cheapest_label": cheapest["label"] if cheapest else "Unknown",
        "is_discriminating": is_discriminating,
        "severity": severity,
        "opportunities": opportunities,
        "savings_by_method": savings_by_method,
        "discrimination_score": compute_discrimination_score(probe_data),
    }


def compute_discrimination_score(probe_data: dict) -> int:
    """
    Compute a 0-100 discrimination severity score.

    Formula:
    - spread_pct contributes up to 40 points (0% = 0, 25%+ = 40)
    - Number of significant gradients contributes up to 30 points (0 = 0, 4 = 30)
    - discrimination_index relative to baseline contributes up to 30 points
    """
    spread_pct = probe_data.get("max_price_spread_pct", 0) or 0
    gradients = probe_data.get("gradients", [])
    sig_count = sum(1 for g in gradients if g.get("significant"))
    di = probe_data.get("discrimination_index", 0) or 0
    baseline = probe_data.get("baseline_price", 0) or 1  # avoid div by zero

    # Spread component (0-40)
    spread_score = min(40, int(spread_pct * 1.6))

    # Gradient count component (0-30)
    grad_score = min(30, sig_count * 7.5)

    # DI component (0-30) - DI as % of baseline
    di_pct = (di / baseline) * 100
    di_score = min(30, int(di_pct * 1.2))

    total = min(100, spread_score + grad_score + di_score)
    return total
