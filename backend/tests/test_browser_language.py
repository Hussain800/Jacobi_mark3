"""
Regression tests for the browser-language vector (Phase 4).

Scientific contract being pinned:
  - Accept-Language header attaches per-agent (language agents get their header,
    everyone else keeps en-US).
  - The controlled pair (AGENT_22/23) differs ONLY by browser language; every
    other vector (geo/device/cookie/referrer/network) is identical.
  - Language is NEVER a Welch t-test driver — it is a controlled OBSERVATION.
  - Agent records + evidence carry the language fields.
  - The existing 24-agent matrix + native-currency fields are unaffected.
"""
import main as M


# ── Header attachment ────────────────────────────────────────────────────────
def test_accept_language_header_attaches_per_agent():
    bd = M.BrightDataMCPClient()
    a00 = next(c for c in M.AGENT_CONFIGS if c["id"] == "AGENT_00")
    a22 = next(c for c in M.AGENT_CONFIGS if c["id"] == "AGENT_22")
    a23 = next(c for c in M.AGENT_CONFIGS if c["id"] == "AGENT_23")
    assert bd._identity_headers(a00)["Accept-Language"] == "en-US,en;q=0.9"
    assert bd._identity_headers(a22)["Accept-Language"] == "en-US,en;q=0.9"
    assert bd._identity_headers(a23)["Accept-Language"] == "ar-AE,ar;q=0.9,en;q=0.5"


def test_default_accept_language_when_unset():
    """An identity with no language field falls back to en-US (legacy behaviour)."""
    bd = M.BrightDataMCPClient()
    assert bd._identity_headers({})["Accept-Language"] == "en-US,en;q=0.9"


# ── Controlled pair differs ONLY by language ─────────────────────────────────
def test_controlled_pair_differs_only_by_language():
    a22 = next(c for c in M.AGENT_CONFIGS if c["id"] == "AGENT_22")
    a23 = next(c for c in M.AGENT_CONFIGS if c["id"] == "AGENT_23")
    # Same pair id, different roles.
    assert a22["language_pair_id"] == a23["language_pair_id"] == "uae_desktop"
    assert a22["language_pair_role"] == "control_en"
    assert a23["language_pair_role"] == "variant_ar"
    # Every non-language vector identical.
    for k in ("geo", "network_tier", "proxy_type"):
        assert a22[k] == a23[k], f"{k} differs → confound"
    for k in ("location", "device", "cookie", "referrer"):
        assert a22["variables"].get(k) == a23["variables"].get(k), f"var.{k} differs → confound"
    # Language is the ONLY difference.
    assert a22["browser_language"] == "en-US"
    assert a23["browser_language"] == "ar-AE"
    # Neither side is a t-test driver.
    assert a22.get("delta_variable") is None
    assert a23.get("delta_variable") is None


def test_all_agents_have_language_metadata():
    assert len(M.AGENT_CONFIGS) == 24
    for c in M.AGENT_CONFIGS:
        assert c.get("browser_language"), f"{c['id']} missing browser_language"
        assert c.get("accept_language_header"), f"{c['id']} missing accept_language_header"
        assert c.get("language_label"), f"{c['id']} missing language_label"


def test_only_one_controlled_pair_and_no_confound_in_drivers():
    """Driver agents (delta_variable set) must all stay en-US so language never
    confounds an existing vector."""
    drivers = [c for c in M.AGENT_CONFIGS if c.get("delta_variable")]
    for c in drivers:
        assert c["browser_language"] == "en-US", f"{c['id']} driver has non-EN language → confound"


# ── Controlled observation, never a significant driver ───────────────────────
def _pair_session(en_price, ar_price):
    def agent(aid, role, lang, label, price, native):
        return dict(agent_id=aid, label=label, status="success", price=price,
                    response_time_ms=1200, is_control=False,
                    variables={"location": "uae_desktop", "device": "macbook_pro",
                               "cookie": "fresh", "referrer": "direct"},
                    network_tier=0, proxy_type="datacenter",
                    native_price=native, native_currency="AED",
                    normalized_price_usd=price, fx_rate_used=0.2723,
                    browser_language=lang, language_label=label,
                    language_pair_id="uae_desktop", language_pair_role=role)
    agents = [agent("AGENT_22", "control_en", "en-US", "English (US)", en_price, 11600.0),
              agent("AGENT_23", "variant_ar", "ar-AE", "Arabic (UAE)", ar_price, 11700.0)]
    # add a couple of normal agents for baseline math
    for i in range(3):
        agents.append(dict(agent_id=f"AGENT_{i:02d}", label=f"A{i}", status="success",
                           price=en_price, response_time_ms=1100, is_control=(i == 0),
                           variables={"location": "x", "device": "y"},
                           native_price=11600.0, native_currency="AED",
                           normalized_price_usd=en_price, browser_language="en-US"))
    return dict(session_id="p", target_url="https://www.amazon.ae/x", target_name="amazon.ae",
                all_prices={a["agent_id"]: a["price"] for a in agents}, agents=agents,
                total_agents=24, successful_agents=len(agents), detected_agents=0, failed_agents=0)


def test_language_observation_detects_difference():
    s = _pair_session(3158.68, 3185.00)
    M.finalize_pricing_session(s, overall_start=0.0)
    obs = s["language_observations"]
    assert len(obs) == 1
    o = obs[0]
    assert o["controlled"] is True
    assert o["control_language"] == "en-US" and o["variant_language"] == "ar-AE"
    assert o["difference_detected"] is True
    assert abs(o["delta_usd"] - 26.32) < 0.01
    # Language must NOT appear as a gradient/driver.
    assert all(g["variable_name"] != "language" for g in s["gradients"])


def test_language_observation_uniform_no_difference():
    s = _pair_session(3158.68, 3158.68)
    M.finalize_pricing_session(s, overall_start=0.0)
    obs = s["language_observations"]
    assert len(obs) == 1
    assert obs[0]["difference_detected"] is False
    assert obs[0]["delta_usd"] == 0.0


def test_no_observation_without_controlled_pair():
    """A session with no language-pair agents yields no language observations."""
    agents = [dict(agent_id=f"AGENT_{i:02d}", label=f"A{i}", status="success", price=200.0,
                   response_time_ms=900, is_control=(i == 0), variables={}, browser_language="en-US")
              for i in range(6)]
    s = dict(session_id="n", target_url="https://x.com", target_name="x",
             all_prices={a["agent_id"]: a["price"] for a in agents}, agents=agents,
             total_agents=24, successful_agents=6, detected_agents=0, failed_agents=0)
    M.finalize_pricing_session(s, overall_start=0.0)
    assert s["language_observations"] == []


# ── Agent results carry language fields ──────────────────────────────────────
def test_build_agent_list_includes_language_fields():
    s = _pair_session(3158.68, 3185.00)
    agents = M.build_agent_list(s)
    a23 = next(a for a in agents if a["agent_id"] == "AGENT_23")
    assert a23["browser_language"] == "ar-AE"
    assert a23["language_label"] == "Arabic (UAE)"
    assert a23["language_pair_role"] == "variant_ar"
    # native currency still present (Phase 3 unaffected).
    assert a23["native_currency"] == "AED"
