"""
Stage 1 reliability tests: the coverage gate + honest accounting.

Verifies that finalize_pricing_session classifies a run by how many agents
returned a usable price, and — critically — never asserts price discrimination
from a thin sample.
"""
import main as M


def _session(priced_prices, total=24):
    """Build a finalized-ready session with `priced_prices` real prices."""
    agents = []
    for i, p in enumerate(priced_prices):
        agents.append(dict(
            agent_id=f"AGENT_{i:02d}", label=f"AGENT_{i:02d} TEST", price=p,
            status="success", response_time_ms=1200, is_control=(i == 0),
            variables={"location": "x", "device": "y"},
            delta_variable=("location" if i % 4 == 1 else None),
            delta_direction=("high" if i % 8 == 1 else ("low" if i % 8 == 5 else None)),
            native_price=p, native_currency="USD", normalized_price_usd=p,
        ))
    return dict(
        session_id="cov", target_url="https://x.com/p", target_name="x",
        all_prices={a["agent_id"]: a["price"] for a in agents}, agents=agents,
        total_agents=total, successful_agents=len(agents),
        detected_agents=0, failed_agents=0,
    )


def test_strong_coverage_allows_topology_claim():
    # 14 varied prices → strong coverage, real topology computed.
    prices = [200 + (i * 7) for i in range(14)]
    s = _session(prices)
    assert M.finalize_pricing_session(s, 0.0)
    assert s["coverage"] == "strong"
    assert s["priced_agents"] == 14
    assert s["topology_class"] != "insufficient_data"


def test_partial_coverage_flags_moderate_confidence():
    prices = [200 + (i * 5) for i in range(7)]  # 7 priced → partial
    s = _session(prices)
    assert M.finalize_pricing_session(s, 0.0)
    assert s["coverage"] == "partial"
    assert "partial coverage" in s["summary"].lower() or "moderate confidence" in s["summary"].lower()
    # Topology still computed for partial. Without a SIGNIFICANT gradient the
    # spread is not attributable to discrimination, so "indeterminate" is a
    # valid (honest) outcome alongside the discrimination classes.
    assert s["topology_class"] in (
        "uniform", "selective", "progressive", "aggressive", "indeterminate")


def test_spread_without_significant_gradient_is_not_discrimination():
    """A price spread with ZERO significant gradients must NOT be classified as
    discrimination (selective/progressive/aggressive). This guards the travel
    case where agents catch different rooms: a $387 spread on a $1548 baseline
    with 0 significant gradients was wrongly called "aggressive". The honest
    label is "indeterminate", with severity 0."""
    # 25% spread, but no gradient marked significant.
    grads = [
        {"variable_name": "location", "delta": 200.0, "significant": False},
        {"variable_name": "device", "delta": 90.0, "significant": False},
    ]
    assert M.classify_topology(grads, di=0.0, baseline=1548.0, spread_pct=25.0) == "indeterminate"
    # No spread at all → uniform.
    assert M.classify_topology([], di=0.0, baseline=1548.0, spread_pct=0.0) == "uniform"
    # One significant gradient → a real (selective) discrimination claim is allowed.
    grads_sig = [{"variable_name": "location", "delta": 80.0, "significant": True}]
    assert M.classify_topology(grads_sig, di=80.0, baseline=1548.0, spread_pct=5.0) == "selective"
    # Severity is 0 when nothing is significant, regardless of spread.
    sess = {"max_price_spread_pct": 25.0, "gradients": grads,
            "discrimination_index": 0.0, "baseline_price": 1548.0}
    assert M.compute_severity_score(sess) == 0.0


def test_limited_coverage_makes_no_discrimination_claim():
    # Only 3 priced → limited. Must NOT assert a topology / discrimination.
    s = _session([300.0, 360.0, 280.0])
    assert M.finalize_pricing_session(s, 0.0)
    assert s["coverage"] == "limited"
    assert s["priced_agents"] == 3
    assert s["topology_class"] == "insufficient_data"
    assert s["discrimination_score"] == 0.0
    assert s["gradients"] == []
    assert "limited coverage" in s["summary"].lower()
    # The price we did observe is still reported.
    assert s["baseline_price"] is not None


def test_coverage_serialized_through_api_result(client):
    import uuid
    sid = uuid.uuid4().hex[:12]
    s = _session([300.0, 360.0, 280.0])
    s["session_id"] = sid
    M.finalize_pricing_session(s, 0.0)
    s["status"] = "completed"
    M.SESSION_STORE[sid] = s
    r = client.get(f"/api/result/{sid}")
    assert r.status_code == 200
    j = r.json()
    assert j["coverage"] == "limited"
    assert j["priced_agents"] == 3
    assert j["topology_class"] == "insufficient_data"
    # PDF must still render for a limited-coverage session.
    rp = client.get(f"/api/export/{sid}/pdf")
    assert rp.status_code == 200
    assert rp.content[:5] == b"%PDF-"


def test_js_heavy_classifier():
    assert M._is_js_heavy("https://www.booking.com/hotel/in/x.html")
    assert M._is_js_heavy("https://www.google.com/travel/flights?q=x")
    assert not M._is_js_heavy("https://www.amazon.ae/dp/B0FL4HLJ56/")
    assert not M._is_js_heavy("")
