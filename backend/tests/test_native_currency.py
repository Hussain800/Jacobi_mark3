"""
Regression tests for native-currency display (Phase 4).

The product captures the real on-page price (e.g. AED 11,600.00 on Amazon.ae)
but historically only displayed the USD-normalized figure. These tests pin the
native-price plumbing so the headline / evidence / PDF can show the value a
shopper actually sees. USD remains the comparison basis — never removed.
"""
import main as M


# ── _native_price_fields: derive native value from on-page raw text ──────────
def test_native_fields_aed():
    out = M._native_price_fields("AED11,600.00", "AED")
    assert out["native_price"] == 11600.0
    assert out["native_currency"] == "AED"
    assert out["fx_rate_used"] == 0.2723
    assert abs(out["normalized_price_usd"] - 3158.68) < 0.01


def test_native_fields_with_space():
    out = M._native_price_fields("AED 11,600.00", "AED")
    assert out["native_price"] == 11600.0 and out["native_currency"] == "AED"


def test_native_fields_usd_is_identity():
    out = M._native_price_fields("$1,234.56", "USD")
    assert out["native_currency"] == "USD"
    assert out["fx_rate_used"] == 1.0
    assert out["normalized_price_usd"] == 1234.56


def test_native_fields_inr_symbol():
    out = M._native_price_fields("₹2,499", "INR")  # ₹2,499
    assert out["native_currency"] == "INR"
    assert out["native_price"] == 2499.0
    assert out["normalized_price_usd"] is not None


def test_native_fields_missing_is_all_none():
    for raw in (None, "", "garbage", "no price here"):
        out = M._native_price_fields(raw, "AED")
        assert out["native_price"] is None
        assert out["native_currency"] is None
        assert out["normalized_price_usd"] is None
        assert out["fx_rate_used"] is None


def test_native_fields_unrecognized_currency_is_none():
    # A token the price regex doesn't recognize as a currency → all-None, so the
    # UI renders N/A rather than a fabricated value.
    out = M._native_price_fields("XYZ 100.00", "XYZ")
    assert out["native_price"] is None
    assert out["native_currency"] is None
    assert out["normalized_price_usd"] is None


def test_fmt_native_none_safe():
    assert M._fmt_native(11600.0, "AED") == "AED 11,600.00"
    assert M._fmt_native(None, "AED") is None
    assert M._fmt_native(100.0, None) is None


# ── Session-level native fields after finalize (no network) ──────────────────
def test_finalize_sets_session_native_currency():
    """A session whose agents carry AED native fields gets a native baseline."""
    agents = [
        dict(agent_id=f"AGENT_{i:02d}", label=f"AGENT_{i:02d} TEST", price=3158.68,
             status="success", response_time_ms=1200, is_control=(i == 0),
             native_price=11600.0, native_currency="AED",
             normalized_price_usd=3158.68, fx_rate_used=0.2723,
             variables={"location": "x"})
        for i in range(10)
    ]
    session = dict(
        session_id="t", target_url="https://www.amazon.ae/x", target_name="amazon.ae",
        all_prices={a["agent_id"]: a["price"] for a in agents},
        agents=agents, total_agents=24, successful_agents=10,
        detected_agents=0, failed_agents=0,
    )
    ok = M.finalize_pricing_session(session, overall_start=0.0)
    assert ok
    assert session["native_currency"] == "AED"
    assert session["native_baseline_price"] == 11600.0
    assert session["normalized_currency"] == "USD"
    assert session["fx_rate_used"] == 0.2723
    # USD baseline preserved as the comparison basis.
    assert abs(session["baseline_price"] - 3158.68) < 0.01


def test_finalize_no_native_is_graceful():
    """Agents without native fields → session native is None (UI renders N/A)."""
    agents = [
        dict(agent_id=f"AGENT_{i:02d}", label=f"AGENT_{i:02d} TEST", price=200.0,
             status="success", response_time_ms=900, is_control=(i == 0), variables={})
        for i in range(6)
    ]
    session = dict(
        session_id="t2", target_url="https://x.com", target_name="x",
        all_prices={a["agent_id"]: a["price"] for a in agents},
        agents=agents, total_agents=24, successful_agents=6,
        detected_agents=0, failed_agents=0,
    )
    ok = M.finalize_pricing_session(session, overall_start=0.0)
    assert ok
    assert session["native_currency"] is None
    assert session["native_baseline_price"] is None
    assert session["normalized_currency"] == "USD"
