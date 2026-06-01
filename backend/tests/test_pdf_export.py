"""
Regression tests for the PDF report export (backend/report_export.py).

Why this exists: the PDF generator repeatedly shipped crashing in production
because it was only ever exercised against the happy-path demo session. Two
real-world shapes crashed it:

  * NameError: leaked loop var in the evidence-table header  -> crashed EVERY
    probe that captured evidence (i.e. every real discriminating result).
  * TypeError: None > int on response_time_ms                -> crashed any
    session reconstructed from Supabase on a cold start (None numeric fields).

These tests feed `export_pdf` the FULL RANGE of production session shapes,
through the REAL FastAPI route, and assert a valid PDF (or a clean 404) with no
500s. Do NOT weaken the cases to make code pass — fix the generator instead.
"""
import pytest


# --------------------------------------------------------------------------- #
# Synthetic-but-realistic session builders (mirror what the probe engine emits)
# --------------------------------------------------------------------------- #
def _agents(n, price=None, rt=None, varied=False, with_evidence=False):
    out = []
    locs = ["manhattan_high", "rural_iowa_low", "sf_high", "london_high", "mumbai_low", "dubai_high"]
    devs = ["macbook_pro", "android_budget", "iphone_15_pro", "chromebook_budget"]
    for i in range(n):
        p = price
        if varied and price is not None:
            p = round(price * (1 + (i - n / 2) * 0.03), 2)
        a = {
            "agent_id": f"AGENT_{i:02d}",
            "label": f"AGENT_{i:02d}  TEST",
            "status": "success" if p is not None else "failed",
            "price": p,
            "response_time_ms": rt,
            "bot_detected": False,
            "detection_signal": None,
            "error_message": None,
            "variables": {"location": locs[i % len(locs)], "device": devs[i % len(devs)],
                          "cookie": "fresh", "referrer": "direct"},
            "delta_variable": "location" if i % 4 == 1 else None,
            "delta_direction": "high" if i % 8 == 1 else ("low" if i % 8 == 5 else None),
            "is_control": i == 0,
            "network_tier": i % 3,
            "proxy_type": ["datacenter", "residential", "mobile"][i % 3],
        }
        if with_evidence and p is not None:
            a["evidence"] = {
                "price_raw_text": f"AED {p:,.2f}",
                "currency_detected": "AED",
                "extraction_method": "scoped_container",
            }
        out.append(a)
    return out


def case_real_uniform():
    """Amazon.ae uniform: 6 real probes + 18 baseline-filled, all same price."""
    agents = _agents(6, price=3158.68, rt=1200) + _agents(18, price=3158.68, rt=0)
    for i, a in enumerate(agents):
        a["agent_id"] = f"AGENT_{i:02d}"
    return "real_uniform", {
        "session_id": "real_uniform", "target_url": "https://www.amazon.ae/Lenovo-Legion/dp/B0FL4HLJ56/",
        "target_name": "amazon.ae", "timestamp": "2026-05-31T20:00:00", "status": "completed",
        "total_agents": 24, "successful_agents": 24, "failed_agents": 0, "detected_agents": 0,
        "elapsed_seconds": 28.4, "control_stability": 1.0, "baseline_price": 3158.68,
        "mean_price": 3158.68, "all_prices": {a["agent_id"]: 3158.68 for a in agents},
        "price_range": [3158.68, 3158.68], "max_price_spread": 0.0, "max_price_spread_pct": 0.0,
        "gradients": [], "discrimination_index": 0.0, "topology_class": "uniform",
        "discrimination_score": 0.0, "agents": agents, "summary": "UNIFORM", "error": None,
    }


def case_real_aggressive():
    """Hotel with strong discrimination + evidence (the prior NameError crash)."""
    agents = _agents(24, price=300.0, rt=1400, varied=True, with_evidence=True)
    prices = [a["price"] for a in agents]
    return "real_agg", {
        "session_id": "real_agg", "target_url": "https://www.booking.com/hotel/in/taj.html",
        "target_name": "Taj Lucknow", "timestamp": "2026-05-31T20:00:00", "status": "completed",
        "total_agents": 24, "successful_agents": 24, "failed_agents": 0, "detected_agents": 0,
        "elapsed_seconds": 64.0, "control_stability": 0.98, "baseline_price": 300.0,
        "mean_price": round(sum(prices) / len(prices), 2),
        "all_prices": {a["agent_id"]: a["price"] for a in agents},
        "price_range": [min(prices), max(prices)], "max_price_spread": round(max(prices) - min(prices), 2),
        "max_price_spread_pct": 45.0,
        "gradients": [
            {"variable_name": "location", "state_high": "High Income", "state_low": "Low Income",
             "mean_price_high": 340.0, "mean_price_low": 260.0, "delta": 80.0, "delta_pct": 26.7,
             "pooled_std": 4.0, "t_statistic": 20.0, "significant": True, "n_high": 6, "n_low": 6},
            {"variable_name": "device", "state_high": "Premium", "state_low": "Budget",
             "mean_price_high": 320.0, "mean_price_low": 290.0, "delta": 30.0, "delta_pct": 10.0,
             "pooled_std": 5.0, "t_statistic": 6.0, "significant": True, "n_high": 4, "n_low": 4},
            {"variable_name": "cookie_profile", "state_high": "Aged", "state_low": "Fresh",
             "mean_price_high": 305.0, "mean_price_low": 300.0, "delta": 5.0, "delta_pct": 1.6,
             "pooled_std": 6.0, "t_statistic": 0.8, "significant": False, "n_high": 2, "n_low": 2},
        ],
        "discrimination_index": 110.0, "topology_class": "aggressive",
        "discrimination_score": 88.0, "agents": agents, "summary": "AGGRESSIVE", "error": None,
    }


def case_partial_coldstart():
    """Supabase cold-start reconstruction: None numerics everywhere (prior TypeError crash)."""
    agents = [{
        "agent_id": f"AGENT_{i:02d}", "label": f"AGENT_{i:02d}", "status": "failed",
        "price": None, "response_time_ms": None, "bot_detected": False,
        "variables": {}, "proxy_type": None,
    } for i in range(24)]
    return "partial1", {
        "session_id": "partial1", "target_url": "https://example.com/x", "target_name": "x",
        "timestamp": "2026-05-31", "status": "completed", "total_agents": 24,
        "successful_agents": 0, "baseline_price": None, "topology_class": "unknown",
        "discrimination_score": 0, "max_price_spread": None, "max_price_spread_pct": None,
        "gradients": [], "agents": agents,
    }


def case_minimal():
    """Absolute minimum a row might carry after a half-failed save."""
    return "minimal1", {
        "session_id": "minimal1", "target_url": "https://t.co", "status": "completed",
        "total_agents": 24, "agents": [],
    }


def case_selective():
    """Mild discrimination with evidence."""
    agents = _agents(24, price=120.0, rt=900, varied=True, with_evidence=True)
    prices = [a["price"] for a in agents]
    return "real_sel", {
        "session_id": "real_sel", "target_url": "https://www.expedia.com/h12345", "target_name": "Hotel X",
        "timestamp": "2026-05-31", "status": "completed", "total_agents": 24, "successful_agents": 22,
        "failed_agents": 2, "detected_agents": 0, "elapsed_seconds": 41.0, "control_stability": 0.99,
        "baseline_price": 120.0, "mean_price": round(sum(prices) / len(prices), 2),
        "all_prices": {a["agent_id"]: a["price"] for a in agents},
        "price_range": [min(prices), max(prices)], "max_price_spread": round(max(prices) - min(prices), 2),
        "max_price_spread_pct": 8.0,
        "gradients": [{"variable_name": "referrer", "state_high": "Aggregator", "state_low": "Direct",
                       "mean_price_high": 126.0, "mean_price_low": 118.0, "delta": 8.0, "delta_pct": 6.7,
                       "pooled_std": 3.0, "t_statistic": 2.6, "significant": True, "n_high": 2, "n_low": 2}],
        "discrimination_index": 8.0, "topology_class": "selective", "discrimination_score": 28.0,
        "agents": agents, "summary": "SELECTIVE", "error": None,
    }


ALL_CASES = [
    case_real_uniform, case_real_aggressive, case_partial_coldstart,
    case_minimal, case_selective,
]


def _seed(session_id, session):
    from main import SESSION_STORE
    SESSION_STORE[session_id] = session


@pytest.mark.parametrize("builder", ALL_CASES, ids=[c.__name__ for c in ALL_CASES])
def test_pdf_export_real_shapes(client, builder):
    """Every production session shape yields a valid PDF over the real HTTP route — never a 500."""
    session_id, session = builder()
    _seed(session_id, session)
    r = client.get(f"/api/export/{session_id}/pdf")
    assert r.status_code == 200, f"{builder.__name__} -> HTTP {r.status_code}: {r.text[:300]}"
    assert r.headers["content-type"].startswith("application/pdf")
    body = r.content
    assert body[:5] == b"%PDF-", f"{builder.__name__} not a PDF (header={body[:8]!r})"
    assert len(body) > 1500, f"{builder.__name__} PDF suspiciously small ({len(body)}B)"


def test_pdf_export_demo(client):
    """The static demo session must export too."""
    r = client.get("/api/export/demo_session_static/pdf")
    assert r.status_code == 200
    assert r.content[:5] == b"%PDF-"


def test_pdf_export_unknown_id_is_404_not_500(client):
    """A missing report is a clean 404, never an unhandled 500."""
    r = client.get("/api/export/does_not_exist_xyz/pdf")
    assert r.status_code == 404
