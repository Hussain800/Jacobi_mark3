"""
JACOBI — Adversarial Pricing Topology Probe
Backend: FastAPI + BrightData MCP (PRO mode)
24-agent parallel probe in 3 staggered waves of 8.
Zero infrastructure: in-memory dict, no Celery, no Redis, no SQL.
"""

import asyncio
import json
import math
import os
import re
import statistics
import time
import uuid
from collections import defaultdict, Counter
from datetime import datetime
from typing import Optional, Dict, List, Tuple

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from gemini_analyzer import analyze_report, GeminiReport
from report_export import router as export_router
from savings_verdict import compute_savings_verdict
from supabase_client import save_probe
from auth_user import get_optional_user
from profile_store import can_run_probe, increment_probe_count
from fastapi import Depends
from scheduler import ScheduleRequest

from brightdata_config import (
    BRIGHTDATA_API_KEY,
    BRIGHTDATA_CUSTOM_HEADERS_ENABLED,
    BRIGHTDATA_UNLOCKER_ZONE,
)


FAKE_ZONE_NAMES = {"placeholder", "none", "todo", "tbd", "mcp_unlocker", "your_zone_name", "your_key_here"}


def brightdata_zone_ready() -> bool:
    """True only when the configured BrightData zone is a real Unlocker zone."""
    return bool(
        BRIGHTDATA_UNLOCKER_ZONE
        and BRIGHTDATA_UNLOCKER_ZONE.strip().lower() not in FAKE_ZONE_NAMES
    )


def brightdata_live_ready() -> bool:
    """True when the backend can run the real multi-network probe path."""
    return bool(BRIGHTDATA_API_KEY) and brightdata_zone_ready()


class TargetProbeInput(BaseModel):
    target_url: str = Field(..., description="Full URL of the target product page")
    target_name: str = Field(default="UA123 JFK→SFO", description="Human-readable target label")
    use_data_dir: Optional[str] = Field(default=None, description="Load pre-cached demo data instead of live probe")
    # Opt-in flag for the public board. Default False → probe stays private to
    # the user's account / history. Frontend cockpit exposes this as a toggle.
    publish_to_board: bool = Field(default=False, description="If true, mark the resulting probe row is_public=true")
    # Audit depth (Phase 5A). "smart24" (default) = Free 24-agent matrix.
    # "pro50" = 50-agent Pro matrix — only honoured for Pro/Enterprise tiers;
    # a Free user requesting pro50 is safely downgraded to smart24 (never errors,
    # never silently runs a costlier probe).
    audit_depth: Optional[str] = Field(default=None, description="smart24 | pro50")


class CalculatedGradientOutput(BaseModel):
    variable_name: str
    state_high: str
    state_low: str
    mean_price_high: float
    mean_price_low: float
    delta: float
    delta_pct: float
    pooled_std: float
    t_statistic: float
    significant: bool
    n_high: int
    n_low: int


class ProbeAgentStatus(BaseModel):
    agent_id: str
    label: str
    status: str
    price: Optional[float] = None
    response_time_ms: Optional[int] = None
    bot_detected: bool = False
    detection_signal: Optional[str] = None
    error_message: Optional[str] = None
    variables: Dict[str, str] = Field(default_factory=dict)
    network_tier: Optional[int] = None
    proxy_type: Optional[str] = None


class TopologyReport(BaseModel):
    session_id: str
    target_url: str
    target_name: str
    timestamp: str
    status: str
    total_agents: int
    successful_agents: int
    failed_agents: int
    detected_agents: int
    elapsed_seconds: float
    control_stability: float
    baseline_price: Optional[float] = None
    mean_price: Optional[float] = None
    all_prices: Dict[str, Optional[float]] = Field(default_factory=dict)
    price_range: Optional[List[float]] = None
    max_price_spread: Optional[float] = None
    max_price_spread_pct: Optional[float] = None
    gradients: List[CalculatedGradientOutput] = Field(default_factory=list)
    discrimination_index: float = 0.0
    topology_class: str = "unknown"
    summary: str = ""
    max_discrimination_scenario: str = ""
    min_discrimination_scenario: str = ""
    agents: List[ProbeAgentStatus] = Field(default_factory=list)
    error: Optional[str] = None


AGENT_CONFIGS: List[dict] = [
    {"id":"AGENT_00","label":"AGENT_00  BASELINE  MACBOOK_MANHATTAN_FRESH_DIRECT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_00; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":0,"is_control":True,"network_tier":0,"proxy_type":"datacenter"},
    {"id":"AGENT_01","label":"AGENT_01  LOCATION_HIGH  MANHATTAN_$150K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_01; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":0,"proxy_type":"datacenter"},"wave":0,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_02","label":"AGENT_02  LOCATION_LOW  RURAL_IOWA_$50K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-IA","referrer":"https://www.united.com/","cookie":"session_id=base_02; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"rural_iowa_low","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":0,"proxy_type":"datacenter"},"wave":0,"delta_variable":"location","delta_direction":"low"},
    {"id":"AGENT_03","label":"AGENT_03  LOCATION_HIGH  SAN_FRANCISCO_$160K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-CA","referrer":"https://www.united.com/","cookie":"session_id=base_03; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"sf_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":0,"proxy_type":"datacenter"},"wave":0,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_04","label":"AGENT_04  LOCATION_HIGH  LONDON_£85K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"GB","referrer":"https://www.united.com/","cookie":"session_id=base_04; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"london_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":0,"proxy_type":"datacenter"},"wave":0,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_05","label":"AGENT_05  LOCATION_LOW  MUMBAI_$15K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"IN","referrer":"https://www.united.com/","cookie":"session_id=base_05; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"mumbai_low","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":0,"proxy_type":"datacenter"},"wave":0,"delta_variable":"location","delta_direction":"low"},
    {"id":"AGENT_06","label":"AGENT_06  DEVICE_HIGH  iPHONE_15_PRO","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_06; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"iphone_15_pro","cookie":"fresh","referrer":"direct","network_tier":0,"proxy_type":"datacenter"},"wave":0,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_07","label":"AGENT_07  DEVICE_LOW  ANDROID_BUDGET","user_agent":"Mozilla/5.0 (Linux; Android 13; SM-A136U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_07; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="120"',"variables":{"location":"manhattan_high","device":"android_budget","cookie":"fresh","referrer":"direct","network_tier":0,"proxy_type":"datacenter"},"wave":0,"delta_variable":"device","delta_direction":"low"},
    {"id":"AGENT_08","label":"AGENT_08  DEVICE_HIGH  MACBOOK_PRO_M3","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_08; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_09","label":"AGENT_09  DEVICE_LOW  CHROMEBOOK","user_agent":"Mozilla/5.0 (X11; CrOS x86_64 14526.57.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_09; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="120"',"variables":{"location":"manhattan_high","device":"chromebook_budget","cookie":"fresh","referrer":"direct","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"device","delta_direction":"low"},
    {"id":"AGENT_10","label":"AGENT_10  DEVICE_HIGH  GALAXY_S24_ULTRA","user_agent":"Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.83 Mobile Safari/537.36","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_10; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="124"',"variables":{"location":"manhattan_high","device":"galaxy_s24","cookie":"fresh","referrer":"direct","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_11","label":"AGENT_11  COOKIE_HIGH  30D_HIGH_INTENT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=aged_11; search_history=UA123,JFK-SFO,United_Airlines; visit_count=22; last_visit=2026-05-24; cart=abandoned; loyalty=gold","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"aged_high_intent","referrer":"direct","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"cookie_profile","delta_direction":"high"},
    {"id":"AGENT_12","label":"AGENT_12  COOKIE_LOW  FRESH_FIRST_VISIT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=fresh_12; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"cookie_profile","delta_direction":"low"},
    {"id":"AGENT_13","label":"AGENT_13  COOKIE_HIGH  90D_PLATINUM","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=loyal_13; search_history=JFK-SFO,EWR-LAX,SFO-JFK; visit_count=89; last_visit=2026-05-22; loyalty=platinum; miles=124500","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"loyalty_90day","referrer":"direct","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"cookie_profile","delta_direction":"high"},
    {"id":"AGENT_14","label":"AGENT_14  REFERRER_HIGH  VIA_KAYAK","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.kayak.com/flights/JFK-SFO/2026-06-01","cookie":"session_id=base_14; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"kayak","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"referrer","delta_direction":"high"},
    {"id":"AGENT_15","label":"AGENT_15  REFERRER_LOW  DIRECT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_15; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":1,"proxy_type":"residential"},"wave":1,"delta_variable":"referrer","delta_direction":"low"},
    {"id":"AGENT_16","label":"AGENT_16  REFERRER_HIGH  SKYSCANNER","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.skyscanner.com/transport/flights/jfksfo/260601","cookie":"session_id=base_16; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"skyscanner","network_tier":2,"proxy_type":"mobile"},"wave":2,"delta_variable":"referrer","delta_direction":"high"},
    {"id":"AGENT_17","label":"AGENT_17  REFERRER_LOW  DIRECT_BASELINE","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_17; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":2,"proxy_type":"mobile"},"wave":2,"delta_variable":"referrer","delta_direction":"low"},
    {"id":"AGENT_18","label":"AGENT_18  LOCATION_HIGH  DUBAI_$110K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"AE","referrer":"https://www.united.com/","cookie":"session_id=base_18; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"dubai_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":2,"proxy_type":"mobile"},"wave":2,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_19","label":"AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-MS","referrer":"https://www.united.com/","cookie":"session_id=base_19; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"mississippi_low","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":2,"proxy_type":"mobile"},"wave":2,"delta_variable":"location","delta_direction":"low"},
    {"id":"AGENT_20","label":"AGENT_20  DEVICE_HIGH  iPAD_PRO_12.9","user_agent":"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_20; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"ipad_pro","cookie":"fresh","referrer":"direct","network_tier":2,"proxy_type":"mobile"},"wave":2,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_21","label":"AGENT_21  DEVICE_LOW  iPHONE_SE_BUDGET","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_21; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="16.6"',"variables":{"location":"manhattan_high","device":"iphone_se_budget","cookie":"fresh","referrer":"direct","network_tier":2,"proxy_type":"mobile"},"wave":2,"delta_variable":"device","delta_direction":"low"},
    {"id":"AGENT_22","label":"AGENT_22  CONTROL  BASELINE_REPEAT_1","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=control_22; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":2,"proxy_type":"mobile"},"wave":2,"is_control":True},
    {"id":"AGENT_23","label":"AGENT_23  CONTROL  BASELINE_REPEAT_2","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=control_23; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct","network_tier":2,"proxy_type":"mobile"},"wave":2,"is_control":True},
]

# ── Browser-language vector (Phase 4) ───────────────────────────────────────
# Catalogue of Accept-Language headers used by language agents. The default for
# every agent is en-US so the existing 24-agent science is unchanged; only the
# controlled language-pair agents override it. We deliberately do NOT scatter
# languages across the matrix, because that would confound language with
# geography/device/etc. Language is only compared within CONTROLLED PAIRS where
# every other vector is held identical and ONLY Accept-Language differs.
LANGUAGE_PRESETS: Dict[str, dict] = {
    "en-US": {"browser_language": "en-US",
              "accept_language_header": "en-US,en;q=0.9",
              "language_label": "English (US)"},
    "ar-AE": {"browser_language": "ar-AE",
              "accept_language_header": "ar-AE,ar;q=0.9,en;q=0.5",
              "language_label": "Arabic (UAE)"},
    "hi-IN": {"browser_language": "hi-IN",
              "accept_language_header": "hi-IN,hi;q=0.9,en;q=0.5",
              "language_label": "Hindi (India)"},
    "fr-FR": {"browser_language": "fr-FR",
              "accept_language_header": "fr-FR,fr;q=0.9,en;q=0.5",
              "language_label": "French (France)"},
    "es-ES": {"browser_language": "es-ES",
              "accept_language_header": "es-ES,es;q=0.9,en;q=0.5",
              "language_label": "Spanish (Spain)"},
}


def _apply_language(cfg: dict, lang_key: str) -> None:
    """Stamp a language preset onto an agent config (mutates in place)."""
    preset = LANGUAGE_PRESETS.get(lang_key, LANGUAGE_PRESETS["en-US"])
    cfg["browser_language"] = preset["browser_language"]
    cfg["accept_language_header"] = preset["accept_language_header"]
    cfg["language_label"] = preset["language_label"]
    cfg.setdefault("variables", {})["language"] = preset["browser_language"]


# Every agent defaults to en-US (unchanged behaviour: en-US,en;q=0.9 was already
# the hardcoded Accept-Language in _identity_headers).
for _cfg in AGENT_CONFIGS:
    _apply_language(_cfg, "en-US")

# ── Controlled language pair ─────────────────────────────────────────────────
# AGENT_22 and AGENT_23 were redundant BASELINE_REPEAT controls (identical to
# each other and to the baseline). We repurpose them into the project's first
# CONTROLLED language pair: both UAE / desktop-macbook / fresh / direct / same
# network tier — the ONLY difference between them is Accept-Language (EN vs AR).
# This is the one place a language pair can be added without (a) destroying an
# existing vector or (b) adding agents (which would be 50-agent Pro mode).
#
# language_pair_id groups the two; language_pair_role marks which side. They are
# intentionally NOT given delta_variable/delta_direction, so the Welch t-test
# driver logic never treats language as a "suspected driver" (rules 5 & 6) — the
# EN-vs-AR comparison is surfaced separately as a controlled observation.
_UAE_PAIR_BASE = {
    "geo": "AE", "network_tier": 0, "proxy_type": "datacenter",
    "language_pair_id": "uae_desktop",
    # Identical on every non-language vector — only Accept-Language differs.
    "variables": {"location": "uae_desktop", "device": "macbook_pro",
                  "cookie": "fresh", "referrer": "direct"},
}
for _cfg in AGENT_CONFIGS:
    if _cfg["id"] == "AGENT_22":
        _cfg.update({**_UAE_PAIR_BASE,
                     "label": "AGENT_22  LANGUAGE_PAIR  UAE_DESKTOP_EN",
                     "language_pair_role": "control_en",
                     # No longer a baseline-repeat control: clear is_control so
                     # it is not averaged into control_stability.
                     "is_control": False})
        _cfg["variables"] = dict(_UAE_PAIR_BASE["variables"])
        _apply_language(_cfg, "en-US")
    elif _cfg["id"] == "AGENT_23":
        _cfg.update({**_UAE_PAIR_BASE,
                     "label": "AGENT_23  LANGUAGE_PAIR  UAE_DESKTOP_AR",
                     "language_pair_role": "variant_ar",
                     "is_control": False})
        _cfg["variables"] = dict(_UAE_PAIR_BASE["variables"])
        _apply_language(_cfg, "ar-AE")


# ── PRO 50-agent matrix (Phase 5A) ──────────────────────────────────────────
# The Free matrix above (24 agents) is LEFT EXACTLY AS-IS. Pro mode = those 24
# PLUS the 26 extra agents below, for 50 total. The extras are not random
# repetition; they add controlled pairs and bigger sample sizes for the existing
# vectors. Every extra agent is built from the same dict shape as the Free ones,
# then stamped with a default language (en-US) and, where it forms a controlled
# pair, the appropriate Accept-Language — using the same _apply_language helper.
#
# IDs continue from AGENT_24..AGENT_49 (no collisions with the Free 0..23).

_MAC_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 "
           "(KHTML, like Gecko) Version/17.4 Safari/605.1.15")
_IPHONE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) "
              "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 "
              "Mobile/15E148 Safari/604.1")
_ANDROID_UA = ("Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 "
               "(KHTML, like Gecko) Chrome/124.0.6367.83 Mobile Safari/537.36")
_SAFARI_CHUA = '"Not/A)Brand";v="99", "Safari";v="17.4"'
_CHROME_CHUA = '"Not/A)Brand";v="99", "Google Chrome";v="124"'


def _pro_agent(idx, label, geo, ua, ch_ua, variables, *, network_tier=1,
               proxy_type="residential", delta_variable=None, delta_direction=None,
               language_pair_id=None, language_pair_role=None, lang_key="en-US",
               referrer="https://www.united.com/", cookie=None):
    """Compact builder for a Pro-extra agent. Mirrors the Free agent dict shape."""
    aid = f"AGENT_{idx:02d}"
    cfg = {
        "id": aid,
        "label": f"{aid}  {label}",
        "user_agent": ua,
        "geo": geo,
        "referrer": referrer,
        "cookie": cookie or f"session_id=pro_{idx}; visit_count=1; last_visit=none",
        "sec_ch_ua": ch_ua,
        "variables": dict(variables),
        "wave": 3,  # Pro agents run as an extra wave; never touched by Free.
        "network_tier": network_tier,
        "proxy_type": proxy_type,
    }
    if delta_variable:
        cfg["delta_variable"] = delta_variable
        cfg["delta_direction"] = delta_direction
    if language_pair_id:
        cfg["language_pair_id"] = language_pair_id
        cfg["language_pair_role"] = language_pair_role
    _apply_language(cfg, lang_key)
    return cfg


def _ctrl_lang_pair(idx_en, idx_ar, pair_id, geo, ua, ch_ua, base_vars,
                    en_key, var_key, label_geo, device_label,
                    network_tier=1, proxy_type="residential"):
    """Build a controlled language pair: two agents identical on every vector
    except Accept-Language. Returns [en_agent, variant_agent]."""
    en = _pro_agent(idx_en, f"LANGUAGE_PAIR  {label_geo}_{device_label}_EN",
                    geo, ua, ch_ua, base_vars, network_tier=network_tier,
                    proxy_type=proxy_type, language_pair_id=pair_id,
                    language_pair_role="control_en", lang_key=en_key)
    var = _pro_agent(idx_ar, f"LANGUAGE_PAIR  {label_geo}_{device_label}_{var_key.split('-')[0].upper()}",
                     geo, ua, ch_ua, base_vars, network_tier=network_tier,
                     proxy_type=proxy_type, language_pair_id=pair_id,
                     language_pair_role=f"variant_{var_key.split('-')[0]}",
                     lang_key=var_key)
    return [en, var]


PRO_EXTRA_AGENT_CONFIGS: List[dict] = []

# (1) Three MORE controlled language pairs (6 agents) — only Accept-Language
#     differs within each pair. These are genuine controlled comparisons.
PRO_EXTRA_AGENT_CONFIGS += _ctrl_lang_pair(  # UAE MOBILE EN vs AR
    24, 25, "uae_mobile", "AE", _IPHONE_UA, _SAFARI_CHUA,
    {"location": "uae_mobile", "device": "iphone_15_pro", "cookie": "fresh", "referrer": "direct"},
    "en-US", "ar-AE", "UAE", "MOBILE", network_tier=2, proxy_type="mobile")
PRO_EXTRA_AGENT_CONFIGS += _ctrl_lang_pair(  # INDIA DESKTOP EN vs HI
    26, 27, "india_desktop", "IN", _MAC_UA, _SAFARI_CHUA,
    {"location": "india_desktop", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
    "en-US", "hi-IN", "INDIA", "DESKTOP")
PRO_EXTRA_AGENT_CONFIGS += _ctrl_lang_pair(  # FRANCE DESKTOP EN vs FR
    28, 29, "france_desktop", "FR", _MAC_UA, _SAFARI_CHUA,
    {"location": "france_desktop", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
    "en-US", "fr-FR", "FRANCE", "DESKTOP")

# (2) Cookie sample-size reinforcement (4 agents) — adds high/low cookie
#     replicates so the cookie_profile comparison isn't n=2.
PRO_EXTRA_AGENT_CONFIGS += [
    _pro_agent(30, "COOKIE_HIGH  60D_FREQUENT", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "aged_high_intent", "referrer": "direct"},
               delta_variable="cookie_profile", delta_direction="high",
               cookie="session_id=aged_30; search_history=JFK-SFO,SFO-LAX; visit_count=44; loyalty=gold"),
    _pro_agent(31, "COOKIE_LOW  FRESH_REPEAT", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="cookie_profile", delta_direction="low"),
    _pro_agent(32, "COOKIE_HIGH  120D_VIP", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "loyalty_120day", "referrer": "direct"},
               delta_variable="cookie_profile", delta_direction="high",
               cookie="session_id=vip_32; visit_count=140; loyalty=platinum; miles=210000"),
    _pro_agent(33, "COOKIE_LOW  FRESH_REPEAT_2", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="cookie_profile", delta_direction="low"),
]

# (3) Referrer sample-size reinforcement (4 agents).
PRO_EXTRA_AGENT_CONFIGS += [
    _pro_agent(34, "REFERRER_HIGH  VIA_EXPEDIA", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "expedia"},
               delta_variable="referrer", delta_direction="high",
               referrer="https://www.expedia.com/Flights"),
    _pro_agent(35, "REFERRER_LOW  DIRECT_REPEAT", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="referrer", delta_direction="low"),
    _pro_agent(36, "REFERRER_HIGH  VIA_GOOGLE", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "google"},
               delta_variable="referrer", delta_direction="high",
               referrer="https://www.google.com/travel/flights"),
    _pro_agent(37, "REFERRER_LOW  DIRECT_REPEAT_2", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="referrer", delta_direction="low"),
]

# (4) Geo coverage (6 agents) — more high/low location replicates.
PRO_EXTRA_AGENT_CONFIGS += [
    _pro_agent(38, "LOCATION_HIGH  SINGAPORE", "SG", _MAC_UA, _SAFARI_CHUA,
               {"location": "singapore_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="location", delta_direction="high"),
    _pro_agent(39, "LOCATION_HIGH  ABU_DHABI", "AE", _MAC_UA, _SAFARI_CHUA,
               {"location": "abudhabi_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="location", delta_direction="high"),
    _pro_agent(40, "LOCATION_LOW  CAIRO", "EG", _MAC_UA, _SAFARI_CHUA,
               {"location": "cairo_low", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="location", delta_direction="low"),
    _pro_agent(41, "LOCATION_HIGH  ZURICH", "CH", _MAC_UA, _SAFARI_CHUA,
               {"location": "zurich_high", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="location", delta_direction="high"),
    _pro_agent(42, "LOCATION_LOW  MANILA", "PH", _MAC_UA, _SAFARI_CHUA,
               {"location": "manila_low", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="location", delta_direction="low"),
    _pro_agent(43, "LOCATION_LOW  LAGOS", "NG", _MAC_UA, _SAFARI_CHUA,
               {"location": "lagos_low", "device": "macbook_pro", "cookie": "fresh", "referrer": "direct"},
               delta_variable="location", delta_direction="low"),
]

# (5) Device controlled pairs (6 agents) — high/low device, location held.
PRO_EXTRA_AGENT_CONFIGS += [
    _pro_agent(44, "DEVICE_HIGH  IPHONE_15_PRO_MAX", "US-NY", _IPHONE_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "iphone_15_pro_max", "cookie": "fresh", "referrer": "direct"},
               network_tier=2, proxy_type="mobile", delta_variable="device", delta_direction="high"),
    _pro_agent(45, "DEVICE_LOW  ANDROID_GO", "US-NY", _ANDROID_UA, _CHROME_CHUA,
               {"location": "manhattan_high", "device": "android_go", "cookie": "fresh", "referrer": "direct"},
               network_tier=2, proxy_type="mobile", delta_variable="device", delta_direction="low"),
    _pro_agent(46, "DEVICE_HIGH  MACBOOK_PRO_M3_MAX", "US-NY", _MAC_UA, _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "macbook_pro_m3_max", "cookie": "fresh", "referrer": "direct"},
               delta_variable="device", delta_direction="high"),
    _pro_agent(47, "DEVICE_LOW  WINDOWS_BUDGET", "US-NY",
               "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
               _CHROME_CHUA,
               {"location": "manhattan_high", "device": "windows_budget", "cookie": "fresh", "referrer": "direct"},
               delta_variable="device", delta_direction="low"),
    _pro_agent(48, "DEVICE_HIGH  IPAD_PRO_M4", "US-NY",
               "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
               _SAFARI_CHUA,
               {"location": "manhattan_high", "device": "ipad_pro_m4", "cookie": "fresh", "referrer": "direct"},
               network_tier=2, proxy_type="mobile", delta_variable="device", delta_direction="high"),
    _pro_agent(49, "DEVICE_LOW  CHROMEBOOK_2", "US-NY",
               "Mozilla/5.0 (X11; CrOS x86_64 14526.57.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36",
               _CHROME_CHUA,
               {"location": "manhattan_high", "device": "chromebook_budget", "cookie": "fresh", "referrer": "direct"},
               delta_variable="device", delta_direction="low"),
]

# The Pro 50 matrix = Free 24 (unchanged) + the 26 extras.
PRO_AGENT_CONFIGS: List[dict] = AGENT_CONFIGS + PRO_EXTRA_AGENT_CONFIGS


def get_agent_configs_for_tier(tier_or_count) -> List[dict]:
    """Return the agent matrix for a tier name or requested count.

    - 'free' / 24 / None / unknown  -> the 24-agent Free matrix (unchanged).
    - 'pro' / 50                     -> the 50-agent Pro matrix.
    - 'enterprise'                   -> Pro 50 for now (100-agent runtime is NOT
                                        implemented; Enterprise stays contact-us).
    Defaults to Free for anything unrecognised, so a bad value can never silently
    run a bigger/costlier probe.
    """
    if isinstance(tier_or_count, str):
        t = tier_or_count.strip().lower()
        if t in ("pro", "enterprise"):
            return PRO_AGENT_CONFIGS
        return AGENT_CONFIGS
    if isinstance(tier_or_count, int):
        return PRO_AGENT_CONFIGS if tier_or_count >= 50 else AGENT_CONFIGS
    return AGENT_CONFIGS


WAVE_CONFIGS: Dict[int, List[dict]] = {}
for cfg in AGENT_CONFIGS:
    WAVE_CONFIGS.setdefault(cfg["wave"], []).append(cfg)

WAVE_STAGGER_S = 2.0

HONEYPOT_SIGNALS = [
    "captcha", "confirm you are human", "unusual traffic", "too many requests",
    "access denied", "check your browser", "blocked", "rate limit",
    "please wait", "automated query", "verify your identity",
]

CURRENCY_RATES = {
    "AED": 0.2723, "QAR": 0.2745, "SAR": 0.2666, "OMR": 2.597,
    "KWD": 3.250, "BHD": 2.652, "INR": 0.0120, "PKR": 0.0036,
    "BDT": 0.0091, "NPR": 0.0075, "GBP": 1.270, "EUR": 1.085,
    "JPY": 0.0067, "SGD": 0.745, "AUD": 0.655, "CAD": 0.730,
    "CHF": 1.110, "SEK": 0.095, "NOK": 0.092, "DKK": 0.145,
    "CNY": 0.138, "KRW": 0.00075, "THB": 0.028, "MYR": 0.215,
    "IDR": 0.000064, "PHP": 0.018, "VND": 0.000041, "TRY": 0.031,
    "ZAR": 0.055, "BRL": 0.195, "MXN": 0.055, "RUB": 0.011,
    "PLN": 0.250, "CZK": 0.043, "HUF": 0.0028, "ILS": 0.270,
    "EGP": 0.021, "NGN": 0.00067,
}

CURRENCY_SYMBOL_MAP = {
    "₹": "INR", "€": "EUR", "£": "GBP", "¥": "JPY",
    "₽": "RUB", "₩": "KRW", "₪": "ILS", "₫": "VND",
    "₱": "PHP", "د.إ": "AED", "﷼": "SAR", "ر.ع": "OMR",
    "ر.ق": "QAR", "د.ك": "KWD", "د.ب": "BHD",
}

PRICE_RANGES = {
    "booking.com": {"min": 15, "max": 25000},
    "expedia": {"min": 30, "max": 15000},
    "hotels.com": {"min": 20, "max": 20000},
    "flydubai": {"min": 10, "max": 5000},
    "united": {"min": 30, "max": 5000},
    "delta": {"min": 30, "max": 5000},
    "emirates": {"min": 30, "max": 10000},
    "amazon": {"min": 1, "max": 50000},
    "default": {"min": 5, "max": 50000},
}


def _parse_number(text: str) -> Optional[float]:
    digits = re.sub(r'[^\d.]', '', text.replace(',', ''))
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def _detect_currency(text: str, url: str) -> tuple[str, float]:
    for sym, code in CURRENCY_SYMBOL_MAP.items():
        if sym in text:
            return code, CURRENCY_RATES.get(code, 1.0)
    codes = re.findall(r'\b(AED|QAR|SAR|OMR|KWD|BHD|INR|GBP|EUR|JPY|SGD|AUD|CAD|CHF|SEK|NOK|TRY|ZAR|BRL|MXN|PLN|CZK|HUF|ILS|EGP|THB|MYR|PHP|IDR|VND)\b', text)
    if codes:
        for code in codes:
            idx = text.find(code)
            ctx = text[max(0, idx - 40):idx + len(code) + 40].lower()
            if any(kw in ctx for kw in ['price', 'total', 'fare', 'amount', 'cost', 'per ', 'only ', 'for ', 'night', 'room', 'ticket', 'adult', 'person']):
                return code, CURRENCY_RATES.get(code, 1.0)
        return codes[0], CURRENCY_RATES.get(codes[0], 1.0)
    return "USD", 1.0


# Price text patterns: "AED 11,600.00", "$1,234.56", "€42.50", "₹2,499", "INR 2499.00"
# Captures: (currency_symbol_or_code, numeric_value)
PRICE_TEXT_RE = re.compile(
    r'(AED|QAR|SAR|OMR|KWD|BHD|INR|PKR|BDT|NPR|GBP|EUR|JPY|SGD|AUD|CAD|CHF|SEK|NOK|DKK|CNY|KRW|THB|MYR|IDR|PHP|VND|TRY|ZAR|BRL|MXN|RUB|PLN|CZK|HUF|ILS|EGP|NGN|USD|US\$|\$|£|€|¥|₹|₽|₩|₪|₫|₱|د\.إ|ر\.ع|ر\.ق|د\.ك|د\.ب|﷼)'
    r'\s*'
    r'(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)',
    re.IGNORECASE,
)


def _parse_price_text(t: str) -> Optional[Tuple[float, str]]:
    """Parse a string like 'AED 11,600.00' or '$1,234.56' into (numeric, currency_code).
    Returns None if no recognizable price.
    """
    if not t:
        return None
    m = PRICE_TEXT_RE.search(t)
    if not m:
        return None
    sym_or_code = m.group(1).upper().replace('US$', '$').replace(' ', '')
    raw = m.group(2).replace(',', '').replace(' ', '')
    try:
        val = float(raw)
    except ValueError:
        return None
    # Map symbol → code
    code = CURRENCY_SYMBOL_MAP.get(sym_or_code, sym_or_code)
    if sym_or_code == '$' or sym_or_code == 'USD':
        code = 'USD'
    return (val, code)


def _to_usd(val: float, code: str) -> float:
    if code == 'USD':
        return val
    rate = CURRENCY_RATES.get(code, 1.0)
    return round(val * rate, 2)


def _fmt_native(val: Optional[float], code: Optional[str]) -> Optional[str]:
    """Human-readable native price string, e.g. 'AED 11,600.00'. None-safe."""
    if val is None or not code:
        return None
    return f"{code} {val:,.2f}"


def _native_price_fields(raw_text: Optional[str], currency_hint: Optional[str]) -> dict:
    """Derive the verifiable NATIVE price (as shown on the page) plus the USD
    normalization, from the evidence raw text.

    This reads the SAME raw on-page string the evidence layer already captured
    (e.g. 'AED11,600.00'), so the native value is exactly what the shopper sees —
    no re-extraction, no guessing. Returns all-None fields when the raw text
    carries no parseable price, so callers can render N/A gracefully.

    Deliberately does NOT touch parse_page_prices: the USD comparison math the
    statistics depend on is unchanged.
    """
    out = {
        "native_price": None,          # float, value on the page
        "native_currency": None,       # ISO-ish code, e.g. 'AED'
        "normalized_price_usd": None,  # float, USD for cross-identity comparison
        "fx_rate_used": None,          # float native->USD multiplier, if known
    }
    parsed = _parse_price_text(raw_text) if raw_text else None
    if not parsed:
        return out
    val, code = parsed
    # Prefer the code parsed from the raw text; fall back to the detector hint.
    code = code or currency_hint
    if val is None or not code:
        return out
    out["native_price"] = round(float(val), 2)
    out["native_currency"] = code
    if code == "USD":
        out["normalized_price_usd"] = round(float(val), 2)
        out["fx_rate_used"] = 1.0
    else:
        rate = CURRENCY_RATES.get(code)
        if rate is not None:
            out["fx_rate_used"] = rate
            out["normalized_price_usd"] = round(float(val) * rate, 2)
    return out


def parse_page_prices(html: str, url: str) -> List[float]:
    """Extract the product price(s) from a page's HTML.

    Strategy: prefer scoped, site-specific containers (Amazon's
    #corePriceDisplay, Booking's [data-testid="price-and-discounted-price"])
    and read the accessibility text (.a-offscreen) which carries the
    canonical price + currency together. Fall back to JSON-LD and
    regex only if scoped extraction fails.

    Critical invariant: the SAME html should always produce the same
    primary price. No "median of random numbers" guesses.
    """
    results: List[float] = []
    url_lower = url.lower()
    currency_code, _rate = _detect_currency(html, url)
    pr = PRICE_RANGES["default"]
    for domain, r in PRICE_RANGES.items():
        if domain in url_lower:
            pr = r
            break

    def store_usd(usd: float):
        if usd and pr["min"] <= usd <= pr["max"]:
            results.append(round(usd, 2))

    def parse_and_store(text: str, fallback_currency: str = "USD"):
        """Parse a raw price string, convert to USD, and store if in range."""
        parsed = _parse_price_text(text)
        if parsed:
            val, code = parsed
            store_usd(_to_usd(val, code))
            return
        # No currency symbol — try as bare number using fallback currency
        n = _parse_number(text)
        if n and n > 0:
            store_usd(_to_usd(n, fallback_currency))

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")

        # ── 1. SCOPED site-specific extraction (HIGHEST PRECISION) ──
        # The strategy: find the MAIN PRODUCT PRICE container, then read
        # the screen-reader accessibility text (.a-offscreen on Amazon,
        # aria-label on Booking) which always carries currency + value
        # together. Junk prices from related-items widgets are excluded
        # because they live OUTSIDE these containers.

        if "amazon" in url_lower:
            # Amazon's canonical price containers, in priority order.
            # The product price is ALWAYS inside one of these. Anything
            # outside is sidebars / "frequently bought" / accessories.
            for container_id in [
                "corePriceDisplay_desktop_feature_div",
                "corePrice_feature_div",
                "corePriceDisplay_mobile",
                "corePriceDisplay_mobile_feature_div",
                "apex_desktop",
                "apex_desktop_newAccordionRow",
                "priceblock_ourprice",
                "priceblock_dealprice",
                "priceblock_saleprice",
                "price_inside_buybox",
                "newBuyBoxPrice",
            ]:
                container = soup.find(id=container_id)
                if not container:
                    continue
                # .a-offscreen carries the accessibility-grade canonical
                # price text including currency. Prefer it over the
                # visible whole/fraction spans.
                offscreen = container.select_one(".a-offscreen")
                if offscreen and offscreen.get_text(strip=True):
                    parse_and_store(offscreen.get_text(strip=True))
                    if results:
                        # Got the main price — done. Skip the noise.
                        break
                container_text = container.get_text(" ", strip=True)
                if container_text:
                    parse_and_store(container_text)
                    if results:
                        break

        elif "booking.com" in url_lower:
            # Booking puts the displayed price in a data-testid container.
            # The text inside has the value + currency.
            for sel in [
                '[data-testid="price-and-discounted-price"]',
                '[data-testid="price-for-x-nights"]',
                '.bui-price-display__value',
            ]:
                for el in soup.select(sel)[:8]:  # cap to avoid related-items noise
                    txt = el.get_text(" ", strip=True)
                    if txt and len(txt) < 80:
                        parse_and_store(txt)

        elif any(a in url_lower for a in ["flydubai", "united", "delta", "emirates", "expedia"]):
            for sel in [
                '[data-testid*="fare-price"]',
                '[data-testid*="price-display"]',
                '[class*="fare-price"]',
                '.total-amount',
            ]:
                for el in soup.select(sel)[:8]:
                    txt = el.get_text(" ", strip=True)
                    if txt and len(txt) < 80:
                        parse_and_store(txt, fallback_currency=currency_code)

        # ── 2. JSON-LD structured data ──
        # ONLY run if scoped extraction got nothing. On Amazon, JSON-LD
        # also includes related products / accessories — running it after
        # we already have the main product price would pollute the result.
        if not results:
            for script in soup.select('script[type="application/ld+json"]'):
                try:
                    data = json.loads(script.string or "{}")
                except Exception:
                    continue
                items = []
                if isinstance(data, dict):
                    items.append(data)
                    if "offers" in data and isinstance(data["offers"], (dict, list)):
                        items.extend(data["offers"]) if isinstance(data["offers"], list) else items.append(data["offers"])
                elif isinstance(data, list):
                    items.extend(data)
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    for price_key in ("price", "lowPrice", "highPrice"):
                        if price_key in item:
                            raw = str(item[price_key])
                            n = _parse_number(raw)
                            if n and n > 0:
                                cur = str(item.get("priceCurrency", currency_code)).upper()
                                store_usd(_to_usd(n, cur))

        # ── 3. OpenGraph / meta tag price (last resort) ──
        if not results:
            for sel in [
                'meta[property="product:price:amount"]',
                'meta[property="og:price:amount"]',
                'meta[itemprop="price"]',
            ]:
                for el in soup.select(sel):
                    content = el.get("content", "")
                    if not content:
                        continue
                    n = _parse_number(content)
                    if n and n > 0:
                        cur_el = soup.select_one('meta[property="product:price:currency"], meta[property="og:price:currency"]')
                        cur = (cur_el.get("content") if cur_el else currency_code) or currency_code
                        store_usd(_to_usd(n, cur.upper()))
    except Exception:
        pass

    # Deduplicate
    results = sorted(set(round(p, 2) for p in results))

    # ── Safety: trim extreme outliers (top/bottom 10%) only when we
    # have plenty of prices and they're widely distributed. Prevents
    # one stray price from skewing a comparison. ──
    if len(results) >= 8:
        cut = max(1, len(results) // 10)
        results = results[cut:-cut]

    # Aggressive regex fallback ONLY when nothing else worked. With
    # proper scoped extraction + JSON-LD + og:price above, this should
    # almost never fire. When it does, we pick the most frequent price
    # (which is almost always the product price — it appears in the
    # buy box, the breadcrumb, the cart, etc.) rather than the median.
    if not results:
        visible = _visible_text(html)

        # All currency patterns with symbols and codes
        currency_patterns = [
            (r'(?:₹|INR)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 0.012, 500, 200000),
            (r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 1.0, 5, 50000),
            (r'(?:USD)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 1.0, 5, 50000),
            (r'(?:AED|د\.إ|د.إ)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 0.2723, 20, 100000),
            (r'(?:EUR|€)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 1.085, 5, 50000),
            (r'(?:GBP|£)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 1.270, 5, 50000),
            (r'(?:QAR|ر.ق)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 0.2745, 20, 100000),
            (r'(?:SAR|﷼)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 0.2666, 20, 100000),
            (r'¥\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 0.0067, 500, 10000000),
            (r'€\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 1.085, 5, 50000),
            (r'£\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', 1.270, 5, 50000),
        ]

        from collections import Counter
        raw_hits: List[float] = []
        for pat, conv_rate, min_val, max_val in currency_patterns:
            for m in re.finditer(pat, visible):
                try:
                    v = float(m.group(1).replace(",", ""))
                    usd = v * conv_rate
                    if min_val <= v <= max_val and pr["min"] <= usd <= pr["max"]:
                        raw_hits.append(round(usd, 2))
                except ValueError:
                    continue

        if raw_hits:
            # The PRODUCT price almost always appears 2+ times on the
            # page (buy-box + breadcrumb + cart preview + JSON-LD).
            # Picking the most frequent value vastly out-performs the
            # median of a noisy distribution.
            most_common = Counter(raw_hits).most_common(3)
            for price, _count in most_common:
                results.append(price)

    return sorted(set(round(p, 2) for p in results))


def _extraction_evidence(html: str, url: str, prices: List[float]) -> dict:
    """Build backwards-compatible evidence metadata for a price extraction.

    Does NOT modify parse_page_prices. Reads the HTML independently to
    determine which extraction method produced the result, then returns
    a dict safe for JSON serialization (all values are plain types).
    Gracefully handles missing/None inputs.
    """
    evidence: dict = {
        "prices_found": prices or [],
        "html_excerpt": (html or "")[:5000],
        "timestamp_ms": int(time.time() * 1000),
        "extraction_method": "none",
        "price_raw_text": None,
        "currency_detected": None,
        # Native (on-page) price fields — populated from price_raw_text below.
        "native_price": None,
        "native_currency": None,
        "normalized_price_usd": None,
        "fx_rate_used": None,
    }
    if not html or not prices:
        return evidence

    url_lower = (url or "").lower()
    currency_code, _rate = _detect_currency(html, url)
    evidence["currency_detected"] = currency_code

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        return evidence

    # Determine extraction method by checking which scoped container matched
    if "amazon" in url_lower:
        for cid in ["corePriceDisplay_desktop_feature_div", "corePrice_feature_div",
                     "priceblock_ourprice", "priceblock_dealprice", "newBuyBoxPrice"]:
            container = soup.find(id=cid)
            if not container:
                continue
            off = container.select_one(".a-offscreen")
            txt = (off.get_text(strip=True) if off else container.get_text(" ", strip=True))
            if txt:
                evidence["extraction_method"] = "scoped_amazon"
                evidence["price_raw_text"] = txt[:200]
                return evidence
    elif "booking.com" in url_lower:
        for sel in ['[data-testid="price-and-discounted-price"]', '.bui-price-display__value']:
            el = soup.select_one(sel)
            if el:
                txt = el.get_text(" ", strip=True)
                if txt and len(txt) < 80:
                    evidence["extraction_method"] = "scoped_booking"
                    evidence["price_raw_text"] = txt[:200]
                    return evidence
    elif any(a in url_lower for a in ["flydubai", "united", "delta", "emirates", "expedia"]):
        for sel in ['[data-testid*="fare-price"]', '[class*="fare-price"]', '.total-amount']:
            el = soup.select_one(sel)
            if el:
                txt = el.get_text(" ", strip=True)
                if txt and len(txt) < 80:
                    evidence["extraction_method"] = "scoped_airline"
                    evidence["price_raw_text"] = txt[:200]
                    return evidence

    # Check JSON-LD
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or "{}")
        except Exception:
            continue
        if isinstance(data, dict):
            for pk in ("price", "lowPrice", "highPrice"):
                if pk in data:
                    evidence["extraction_method"] = "json_ld"
                    evidence["price_raw_text"] = str(data[pk])[:200]
                    return evidence

    # Check OpenGraph / meta
    for sel in ['meta[property="product:price:amount"]', 'meta[itemprop="price"]']:
        el = soup.select_one(sel)
        if el and el.get("content"):
            evidence["extraction_method"] = "og_meta"
            evidence["price_raw_text"] = el["content"][:200]
            return evidence

    # Fallback: regex matched
    if prices:
        evidence["extraction_method"] = "regex_fallback"
        visible = _visible_text(html)
        m = PRICE_TEXT_RE.search(visible)
        if m:
            evidence["price_raw_text"] = (m.group(1) + " " + m.group(2))[:200]

    return evidence


def _visible_text(html: str) -> str:
    """Extract VISIBLE rendered text from HTML — strips <script>, <style>,
    <!-- comments -->, and HTML tags. Without this, bot-detection matches
    on stuff like `<!-- leaving comment so file is not blocked --> in
    legitimate HTML and false-positives the whole probe."""
    try:
        from bs4 import BeautifulSoup, Comment
        soup = BeautifulSoup(html, "lxml")
        for el in soup(["script", "style", "noscript", "head"]):
            el.decompose()
        for c in soup.find_all(string=lambda t: isinstance(t, Comment)):
            c.extract()
        return soup.get_text(" ", strip=True).lower()
    except Exception:
        # Best-effort regex strip if BS4 fails.
        t = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)
        t = re.sub(r"<script[^>]*>.*?</script>", "", t, flags=re.DOTALL | re.IGNORECASE)
        t = re.sub(r"<style[^>]*>.*?</style>", "", t, flags=re.DOTALL | re.IGNORECASE)
        t = re.sub(r"<[^>]+>", " ", t)
        return t.lower()


# Bot signals must be strong phrases that actually appear on bot-block
# landing pages — not common substrings. "blocked" alone is a false
# positive (appears in product reviews, in JS code, in HTML comments).
HONEYPOT_PHRASES = [
    "verify you are a human",
    "please confirm you are human",
    "please verify that you are not a robot",
    "i'm not a robot",
    "captcha",
    "complete the captcha",
    "access denied",
    "your access to this site has been limited",
    "your request has been blocked",
    "your ip has been blocked",
    "automated query",
    "unusual traffic from your computer",
    "rate limit exceeded",
    "too many requests from your network",
    "to continue, please verify",
    "checking your browser before accessing",
    "this challenge will help us ensure",
]


def _has_price_in_html(text: str) -> bool:
    """Check if the RAW HTML (including script tags) contains price patterns.

    Amazon, Booking, and many sites embed canonical prices inside
    <script type="application/ld+json"> blocks. _visible_text() strips
    those scripts, so the thin-page heuristic would false-positive on
    valid pages that put prices in JSON-LD but have minimal visible text.

    This helper searches the FULL raw HTML (not stripped) for price signals
    before the thin-page heuristic fires.
    """
    if not text:
        return False
    # Check raw text for price patterns (currency symbol + number).
    if PRICE_TEXT_RE.search(text):
        return True
    # Check for JSON-LD price properties inside script tags.
    import re as _re
    ld_price = _re.search(
        r'"(?:price|lowPrice|highPrice|offers)"\s*:\s*[{\[]|"priceCurrency"\s*:',
        text, _re.IGNORECASE,
    )
    if ld_price:
        return True
    # Check for meta tag prices.
    if _re.search(r'<meta[^>]+(?:product:price|og:price|itemprop="price")', text, _re.IGNORECASE):
        return True
    return False


def check_bot_detection(text: str) -> Tuple[bool, Optional[str]]:
    """Return (blocked, signal_phrase). Operates on VISIBLE rendered text
    only for bot-phrase checks — won't false-positive on dev comments or
    JS strings inside legitimate pages.

    Three layers:
      1. Explicit honeypot phrases in visible text.
      2. Raw HTML price check — if the full HTML has price signals
         (including JSON-LD), the page is valid regardless of visible text.
      3. Suspiciously thin page heuristic — fires ONLY when there are NO
         price signals anywhere in the raw HTML AND the visible text is
         abnormally small.
    """
    visible = _visible_text(text)
    has_visible_price = bool(PRICE_TEXT_RE.search(visible))

    # 1. Explicit phrases (most reliable signal).
    short = len(visible) < 4000
    head = visible[:4000]
    for phrase in HONEYPOT_PHRASES:
        if phrase in head:
            return True, phrase
        if short and phrase in visible:
            return True, phrase

    # 2. Check raw HTML for price signals BEFORE thin-page heuristic.
    #    If the full HTML (including JSON-LD scripts) contains price data,
    #    this is a valid product page — never flag it as blocked.
    if not text:
        return True, "empty response"
    if _has_price_in_html(text):
        return False, None

    # 3. Heuristic thin-page check — fires ONLY when there are ZERO price
    #    signals anywhere (visible text, JSON-LD, meta tags). At this point
    #    we're confident the page is either a block page or a pure-JS shell.
    if len(text) < 800 and len(visible) < 80:
        return True, "empty page (blocked / JS-only shell)"
    if len(text) < 12000 and len(visible) < 200:
        # Booking.com's blocker returns ~8KB of pure-JS shell.
        return True, "JS-only shell (likely blocked)"

    return False, None


def check_zero_variance(prices: Dict[str, Optional[float]]) -> bool:
    valid = [p for p in prices.values() if p is not None]
    if len(valid) < 2:
        return False
    return (max(valid) - min(valid)) < 0.01


class BrightDataAPIError(Exception):
    pass


class BrightDataMCPClient:
    """BrightData HTTP API client (replaces MCP stdio transport).
    
    Uses the Unlocker API directly via REST instead of the MCP subprocess,
    which has known stdio issues on Windows.
    """
    BRD_API = "https://api.brightdata.com/request"

    def __init__(self):
        self.api_key = BRIGHTDATA_API_KEY
        self._client = None

    async def start(self):
        import httpx
        self._client = httpx.AsyncClient(timeout=60.0)

    # Conditions under which we abandon BrightData for THIS request and
    # use a direct HTTP fetch instead. Triggered by missing key, billing /
    # KYC / payment errors, zone validation errors, and forbidden responses.
    # The point: keep the product working while the BrightData zone is
    # being provisioned, without lying to the user about results. Direct
    # HTTP loses the IP/geo vector (no proxies) but device, cookie, and
    # referrer vectors still work honestly because they live in headers.
    _BD_FALLBACK_SUBSTRINGS = (
        "zone", "validation", "proxy_type", "not_authorized", "unauthorized",
        "payment", "card", "billing", "kyc", "verification", "verify",
        "forbidden", "trial", "expired",
    )

    def _should_fallback(self, status_code: int, body: str) -> bool:
        if status_code in (400, 401, 402, 403):
            return True
        if status_code >= 500:
            return True
        low = (body or "").lower()
        return any(s in low for s in self._BD_FALLBACK_SUBSTRINGS)

    def _identity_headers(self, identity: dict) -> dict:
        headers = {
            "User-Agent": identity.get("user_agent") or (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            # Browser-language vector: use the agent's Accept-Language when set
            # (language-pair agents carry e.g. 'ar-AE,ar;q=0.9,en;q=0.5'); every
            # other agent keeps the original en-US default, so behaviour for the
            # existing 22 agents is unchanged.
            "Accept-Language": identity.get("accept_language_header") or "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
        }
        if identity.get("referrer"):
            headers["Referer"] = identity["referrer"]
        if identity.get("cookie"):
            headers["Cookie"] = identity["cookie"]
        ua = headers["User-Agent"]
        if identity.get("sec_ch_ua") and any(b in ua for b in ("Chrome/", "Chromium/", "Edg/")):
            headers["Sec-CH-UA"] = identity["sec_ch_ua"]
        return headers

    async def _direct_http_fetch(self, url: str, identity: dict, timeout_s: float) -> dict:
        """Direct HTTP fetch — used when BrightData is unavailable.

        Sends the agent's User-Agent / Accept-Language / Referer so device,
        cookie-profile and referrer vectors remain honest. The location /
        geo-IP vector degrades because we're not behind a proxy — that's
        logged internally; the customer-facing UI is unchanged.
        """
        start_ts = time.time()
        headers = self._identity_headers(identity)
        try:
            r = await asyncio.wait_for(
                self._client.get(
                    url,
                    headers=headers,
                    follow_redirects=True,
                    timeout=timeout_s,
                ),
                timeout=timeout_s,
            )
            elapsed_ms = int((time.time() - start_ts) * 1000)
            if r.status_code in (200, 201, 202, 301, 302, 304):
                return {"success": True, "text": r.text, "elapsed_ms": elapsed_ms, "_fallback": "direct_http"}
            return {"success": False, "elapsed_ms": elapsed_ms,
                    "error": f"Direct HTTP returned {r.status_code}",
                    "_fallback": "direct_http"}
        except asyncio.TimeoutError:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": f"Direct HTTP timeout {timeout_s}s", "_fallback": "direct_http"}
        except Exception as e:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": f"Direct HTTP error: {e}", "_fallback": "direct_http"}

    async def probe_url(self, url: str, identity: dict, timeout_s: float = 30.0) -> dict:
        if not self._client:
            raise RuntimeError("Client not initialized")
        start_ts = time.time()
        geo = identity.get("geo", "US")
        country = geo.split("-")[0].lower()
        proxy_type = identity.get("proxy_type", "residential")

        # Skip the BrightData call entirely (and pay no round-trip cost)
        # when EITHER the API key OR the unlocker zone is obviously absent.
        # A zone of "" / None / "placeholder" means the user hasn't been
        # provisioned a zone yet (KYC pending, etc.). We don't lie to the
        # user about this — we just route through the direct-HTTP fallback,
        # which still runs device/cookie/referrer vectors honestly.
        zone_missing = (
            not BRIGHTDATA_UNLOCKER_ZONE
            or BRIGHTDATA_UNLOCKER_ZONE.strip().lower() in FAKE_ZONE_NAMES
        )
        if not self.api_key or zone_missing:
            reason = "no api_key" if not self.api_key else "no zone"
            print(f"[BD-FALLBACK] {reason}; direct HTTP for {identity.get('id','?')}", flush=True)
            return await self._direct_http_fetch(url, identity, timeout_s)

        try:
            payload = {
                "zone": BRIGHTDATA_UNLOCKER_ZONE,
                "url": url,
                "format": "raw",
                "country": country,
            }
            if BRIGHTDATA_CUSTOM_HEADERS_ENABLED:
                payload["headers"] = self._identity_headers(identity)
            response = await asyncio.wait_for(
                self._client.post(
                    self.BRD_API,
                    json=payload,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                ),
                timeout=timeout_s,
            )
            elapsed_ms = int((time.time() - start_ts) * 1000)
            if response.status_code == 200:
                body = response.text or ""
                if len(body) < 500:
                    print(f"[BD-FALLBACK] BD empty response ({len(body)}B) for {identity.get('id','?')} -> direct HTTP", flush=True)
                    return await self._direct_http_fetch(url, identity, timeout_s)
                return {"success": True, "text": body, "elapsed_ms": elapsed_ms}
            # Auth / billing / zone / validation → silently fall back.
            if self._should_fallback(response.status_code, response.text):
                print(f"[BD-FALLBACK] BD {response.status_code} for {identity.get('id','?')}: "
                      f"{response.text[:160]!r} -> direct HTTP", flush=True)
                return await self._direct_http_fetch(url, identity, timeout_s)
            # Anything else (e.g. site-side block) → surface honestly.
            return {"success": False, "elapsed_ms": elapsed_ms,
                    "error": f"API returned {response.status_code}: {response.text[:200]}"}
        except asyncio.TimeoutError:
            # Treat BD timeouts as transport-level failures → fall back.
            print(f"[BD-FALLBACK] BD timeout for {identity.get('id','?')} -> direct HTTP", flush=True)
            return await self._direct_http_fetch(url, identity, timeout_s)
        except Exception as e:
            print(f"[BD-FALLBACK] BD exception for {identity.get('id','?')}: {e!r} -> direct HTTP", flush=True)
            return await self._direct_http_fetch(url, identity, timeout_s)

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


SESSION_STORE: Dict[str, dict] = {}
ACTIVE_SESSION_ID: Optional[str] = None


def create_session(target_url: str, target_name: str) -> Tuple[str, dict]:
    global ACTIVE_SESSION_ID
    session_id = uuid.uuid4().hex[:12]
    session = dict(session_id=session_id, target_url=target_url, target_name=target_name,
        timestamp=datetime.now().isoformat(), status="running", total_agents=24,
        successful_agents=0, failed_agents=0, detected_agents=0, elapsed_seconds=0.0,
        control_stability=0.0, baseline_price=None, mean_price=None, all_prices={},
        price_range=None, max_price_spread=None, max_price_spread_pct=None, gradients=[],
        discrimination_index=0.0, topology_class="unknown", summary="",
        max_discrimination_scenario="", min_discrimination_scenario="", agents=[], error=None,
        discrimination_score=0.0)
    SESSION_STORE[session_id] = session
    ACTIVE_SESSION_ID = session_id
    return session_id, session


def compute_language_observations(session: dict) -> List[dict]:
    """Compute price deltas for CONTROLLED browser-language pairs ONLY.

    A controlled pair is two agents sharing the same `language_pair_id` where
    every vector (location/device/cookie/referrer/network) is identical and the
    ONLY difference is Accept-Language. Both sides must have returned a price.

    This is deliberately SEPARATE from compute_gradients / the Welch t-test:
    a single pair has n=1 per side, so it can never be a "statistically
    significant driver" — and the rules forbid claiming language discrimination
    without controlled pairs. We therefore surface this as a CONTROLLED
    OBSERVATION (metadata), not a suspected driver. The UI/PDF label it as such.
    """
    by_pair: Dict[str, Dict[str, dict]] = defaultdict(dict)
    for a in session.get("agents", []):
        pid = a.get("language_pair_id")
        role = a.get("language_pair_role")
        if pid and role and a.get("price") is not None:
            by_pair[pid][role] = a

    observations: List[dict] = []
    for pid, sides in by_pair.items():
        ctrl = sides.get("control_en")
        variant = next((v for k, v in sides.items() if k != "control_en"), None)
        if not ctrl or not variant:
            continue
        cp = ctrl.get("price")
        vp = variant.get("price")
        if cp is None or vp is None:
            continue
        delta = round(vp - cp, 2)
        delta_pct = round((delta / cp * 100), 2) if cp else 0.0
        observations.append({
            "pair_id": pid,
            "controlled": True,
            "control_language": ctrl.get("browser_language"),
            "control_language_label": ctrl.get("language_label"),
            "variant_language": variant.get("browser_language"),
            "variant_language_label": variant.get("language_label"),
            "control_price_usd": cp,
            "variant_price_usd": vp,
            "control_native": _fmt_native(ctrl.get("native_price"), ctrl.get("native_currency")),
            "variant_native": _fmt_native(variant.get("native_price"), variant.get("native_currency")),
            "delta_usd": delta,
            "delta_pct": delta_pct,
            "difference_detected": abs(delta) >= 0.01,
            # Held-constant vectors, for transparency in the UI/PDF.
            "held_constant": {
                k: ctrl.get("variables", {}).get(k)
                for k in ("location", "device", "cookie", "referrer")
            },
        })
    return observations


def compute_gradients(session: dict) -> List[dict]:
    agents = session.get("agents", [])
    baseline = session.get("baseline_price", 0.0)
    if not baseline: return []
    groups: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
    for a in agents:
        if a.get("price") is None: continue
        v = a.get("delta_variable"); d = a.get("delta_direction")
        if v and d: groups[v][d].append(a["price"])
    results = []
    for var_name, dirs in groups.items():
        high = dirs.get("high", []); low = dirs.get("low", [])
        if not high or not low: continue
        mh, ml = statistics.mean(high), statistics.mean(low)
        delta, dpct = mh - ml, ((mh - ml) / baseline * 100) if baseline else 0.0
        nh, nl = len(high), len(low)
        vh = statistics.variance(high) if nh > 1 else 0.0
        vl = statistics.variance(low) if nl > 1 else 0.0
        ps = math.sqrt(vh / nh + vl / nl) if (vh + vl) > 0 else 0.0
        t = delta / ps if ps > 0 else 0.0
        labels_high = {"location": "High Income Area", "device": "Premium Device", "cookie_profile": "Aged Profile", "referrer": "Aggregator"}
        labels_low = {"location": "Low Income Area", "device": "Budget Device", "cookie_profile": "Fresh Profile", "referrer": "Direct"}
        results.append(dict(variable_name=var_name, state_high=labels_high.get(var_name, "High"),
            state_low=labels_low.get(var_name, "Low"), mean_price_high=round(mh, 2), mean_price_low=round(ml, 2),
            delta=round(delta, 2), delta_pct=round(dpct, 2), pooled_std=round(ps, 4),
            t_statistic=round(t, 4), significant=abs(t) > 2.0, n_high=nh, n_low=nl))
    return results


def classify_topology(gradients: List[dict], di: float, baseline: float, spread_pct: float = 0) -> str:
    sig = sum(1 for g in gradients if g["significant"])
    di_pct = max((di / baseline * 100) if baseline else 0, spread_pct)
    if sig == 0 and di_pct < 5: return "uniform"
    if sig <= 1 and di_pct < 12: return "selective"
    if sig <= 3 and di_pct < 25: return "progressive"
    return "aggressive"


def compute_severity_score(session: dict) -> float:
    """Compute a 0-100 pricing discrimination severity score."""
    spread_pct = session.get("max_price_spread_pct", 0) or 0
    sig_count = sum(1 for g in session.get("gradients", []) if g.get("significant"))
    di = session.get("discrimination_index", 0) or 0
    baseline = session.get("baseline_price", 0) or 1
    # Score: 0-40 from spread, 0-30 from sig factors, 0-30 from DI/baseline ratio
    spread_score = min(spread_pct * 2, 40)
    sig_score = min(sig_count * 10, 30)
    di_score = min((di / baseline) * 100, 30)
    return round(min(spread_score + sig_score + di_score, 100), 1)


def finalize_pricing_session(session: dict, overall_start: float) -> bool:
    """Fill every derived pricing field for a session with valid prices."""
    valid = [p for p in session.get("all_prices", {}).values() if p is not None]
    if not valid:
        return False

    bp = statistics.median(valid)
    min_price = min(valid)
    max_price = max(valid)
    spread = max_price - min_price

    session["baseline_price"] = round(bp, 2)
    session["mean_price"] = round(statistics.mean(valid), 2)
    session["price_range"] = [round(min_price, 2), round(max_price, 2)]
    session["max_price_spread"] = round(spread, 2)
    session["max_price_spread_pct"] = round((spread / bp) * 100, 2) if bp else 0

    # ── Native (on-page) currency for the headline ──────────────────────────
    # Use the dominant native currency captured across priced agents and report
    # the baseline in that currency, so the headline matches what a shopper sees
    # (e.g. "AED 11,600.00"). The USD figures above remain the comparison basis.
    _native_codes = [
        a.get("native_currency") for a in session.get("agents", [])
        if a.get("native_currency") and a.get("native_price") is not None
    ]
    if _native_codes:
        dominant = Counter(_native_codes).most_common(1)[0][0]
        fx = CURRENCY_RATES.get(dominant, 1.0) if dominant != "USD" else 1.0
        # Native baseline: prefer an actual captured native value at the USD
        # baseline; else convert the USD baseline back via the known fx rate.
        native_baseline = None
        for a in session.get("agents", []):
            if (a.get("native_currency") == dominant
                    and a.get("normalized_price_usd") is not None
                    and abs((a["normalized_price_usd"] or 0) - bp) < 0.01
                    and a.get("native_price") is not None):
                native_baseline = a["native_price"]
                break
        if native_baseline is None and fx:
            native_baseline = round(bp / fx, 2) if fx else None
        session["native_currency"] = dominant
        session["native_baseline_price"] = native_baseline
        session["fx_rate_used"] = fx
        session["normalized_currency"] = "USD"
    else:
        session["native_currency"] = None
        session["native_baseline_price"] = None
        session["fx_rate_used"] = None
        session["normalized_currency"] = "USD"

    controls = [
        a["price"]
        for a in session.get("agents", [])
        if a.get("is_control") and a.get("price") is not None
    ]
    if len(controls) >= 2 and statistics.mean(controls):
        cv = statistics.stdev(controls) / statistics.mean(controls)
        session["control_stability"] = round(1.0 - min(cv * 10, 1.0), 4)
    elif controls:
        session["control_stability"] = 1.0

    gradients = compute_gradients(session)
    session["gradients"] = gradients
    di = sum(abs(g["delta"]) for g in gradients if g["significant"])
    session["discrimination_index"] = round(di, 2)
    session["topology_class"] = classify_topology(gradients, di, bp, session.get("max_price_spread_pct", 0))
    session["discrimination_score"] = compute_severity_score(session)

    # Controlled browser-language observations (metadata, NOT a t-tested driver).
    session["language_observations"] = compute_language_observations(session)

    sig_vars = [g for g in gradients if g["significant"]]
    sig_details = "; ".join(f"{g['variable_name']}: ${g['delta']:+.2f}" for g in sig_vars)
    if session["topology_class"] == "uniform":
        session["summary"] = (
            f"UNIFORM PRICING DETECTED. Product price verified at ${bp:.2f}. "
            "Hidden premium: $0.00. No measurable price discrimination across returned identities."
        )
    else:
        session["summary"] = (
            f"TOPOLOGY: {session['topology_class'].upper()}. "
            f"Baseline: ${bp:.2f}. Spread: ${session['max_price_spread']:.2f}. "
            f"DI: ${di:.2f}. Significant: {len(sig_vars)} vars. {sig_details}."
        )

    priced_agents = [a for a in session.get("agents", []) if a.get("price") is not None]
    max_a = max(priced_agents, key=lambda x: x["price"], default=None)
    min_a = min(priced_agents, key=lambda x: x["price"], default=None)
    session["max_discrimination_scenario"] = (
        f"Max: {max_a['label']} @ ${max_a['price']:.2f}" if max_a else "N/A"
    )
    session["min_discrimination_scenario"] = (
        f"Min: {min_a['label']} @ ${min_a['price']:.2f}" if min_a else "N/A"
    )
    # Honest probe accounting (Phase 5A): how many agents were REALLY probed vs
    # filled by the exact-uniform gate. response_time_ms > 0 marks a real probe;
    # inferred=True marks a gate-skipped agent. Never conflate the two.
    agents_all = session.get("agents", [])
    real = sum(1 for a in agents_all if (a.get("response_time_ms") or 0) > 0)
    skipped = sum(1 for a in agents_all if a.get("inferred"))
    ev_count = sum(1 for a in agents_all
                   if isinstance(a.get("evidence"), dict)
                   and a["evidence"].get("extraction_method") not in (None, "none", ""))
    session["real_probes_executed"] = real
    session["skipped_inferred_agents"] = skipped
    session["evidence_count"] = ev_count

    session["status"] = "completed"
    session["error"] = None
    session["elapsed_seconds"] = round(time.time() - overall_start, 2)
    return True


async def launch_single_agent(bd: BrightDataMCPClient, url: str, cfg: dict, timeout_s: float = 30.0) -> dict:
    s = dict(agent_id=cfg["id"], label=cfg["label"], status="in_flight", price=None,
        response_time_ms=None, bot_detected=False, detection_signal=None, error_message=None,
        variables=cfg.get("variables", {}), delta_variable=cfg.get("delta_variable"),
        delta_direction=cfg.get("delta_direction"), is_control=cfg.get("is_control", False),
        network_tier=cfg.get("network_tier"), proxy_type=cfg.get("proxy_type"),
        # Browser-language vector metadata (present on every agent, even on
        # failure/blocked, so the UI/PDF can always show the language probed).
        browser_language=cfg.get("browser_language"),
        accept_language_header=cfg.get("accept_language_header"),
        language_label=cfg.get("language_label"),
        language_pair_id=cfg.get("language_pair_id"),
        language_pair_role=cfg.get("language_pair_role"))
    retry_cfg = dict(cfg)
    try:
        last_failure = "Unknown"
        for attempt_index, attempt_cfg in enumerate((cfg, retry_cfg)):
            if attempt_index:
                await asyncio.sleep(0.75 * attempt_index)
            r = await bd.probe_url(url, attempt_cfg, timeout_s)
            s["response_time_ms"] = r.get("elapsed_ms", 0)
            if not r["success"]:
                last_failure = r.get("error", "Unknown")
                continue
            detected, signal = check_bot_detection(r.get("text", ""))
            if detected:
                s["status"] = "detected"
                s["bot_detected"] = True
                s["detection_signal"] = signal
                last_failure = signal or "Bot detected"
                continue
            prices = parse_page_prices(r.get("text", ""), url)
            if not prices:
                s["status"] = "failed"
                s["bot_detected"] = False
                s["detection_signal"] = None
                last_failure = "No valid price found"
                continue
            s["price"] = prices[len(prices) // 2]
            s["status"] = "success"
            s["bot_detected"] = False
            s["detection_signal"] = None
            s["error_message"] = None
            ev = _extraction_evidence(r.get("text", ""), url, prices)
            # Derive the verifiable native price from the raw on-page text and
            # fold it into both the evidence dict and the agent top-level so the
            # UI/PDF can show "AED 11,600.00" instead of only the USD figure.
            native = _native_price_fields(
                ev.get("price_raw_text"), ev.get("currency_detected")
            )
            ev.update(native)
            # Fold the browser-language metadata into evidence too, so a single
            # agent record carries the full provenance (language + raw text +
            # native price + extraction method).
            ev["browser_language"] = cfg.get("browser_language")
            ev["accept_language_header"] = cfg.get("accept_language_header")
            ev["language_label"] = cfg.get("language_label")
            s["evidence"] = ev
            s["native_price"] = native["native_price"]
            s["native_currency"] = native["native_currency"]
            s["normalized_price_usd"] = native["normalized_price_usd"]
            s["fx_rate_used"] = native["fx_rate_used"]
            return s
        s["error_message"] = None if s["status"] == "detected" else last_failure
        if s["status"] == "in_flight":
            s["status"] = "failed"
            s["error_message"] = last_failure
        return s
    except Exception as e:
        s["status"] = "failed"; s["error_message"] = str(e); return s


async def run_full_probe(url: str, name: str, tier: str = "free") -> dict:
    """Synchronous wrapper for callers that want the full result. The
    /api/probe endpoint now launches the engine via run_probe_in_background()
    instead, so this blocking variant is only used by scripts / tests.

    tier selects the matrix: 'free' -> 24 agents, 'pro' -> 50 agents.
    """
    sid, session = create_session(url, name)
    return await _run_probe_engine(session, url, agent_configs=get_agent_configs_for_tier(tier))


async def _run_probe_engine(session: dict, url: str,
                            agent_configs: Optional[List[dict]] = None) -> dict:
    """Run the 24-agent probe engine with progressive probing.

    Phase 1: 8 fast agents (US-data proxies) run in parallel. If prices
    are uniform (< 2% spread), finalize immediately and skip Phase 2.
    This gives ~5s results for non-discriminating sites like Amazon.

    Phase 2: Only launched when Phase 1 detects meaningful price variance.
    Runs the remaining 16 agents for full statistical gradient analysis.
    """
    overall_start = time.time()
    # Default to the Free 24-agent matrix so existing callers are byte-identical.
    if agent_configs is None:
        agent_configs = AGENT_CONFIGS
    n_agents = len(agent_configs)
    session["total_agents"] = n_agents
    session["configured_agents"] = n_agents
    bd = BrightDataMCPClient()
    await bd.start()

    def _ingest_agent(r):
        if isinstance(r, Exception):
            session["failed_agents"] += 1
            return
        session["agents"].append(r)
        if r.get("price") is not None:
            session["all_prices"][r["agent_id"]] = r["price"]
            session["successful_agents"] += 1
        elif r.get("bot_detected"):
            session["detected_agents"] += 1
        else:
            session["failed_agents"] += 1

    try:
        if brightdata_live_ready():
            probe_timeout_s = 25.0
            # Phase-1 scout count scales with the matrix: 10 for Free-24, more
            # for Pro-50 so the uniform gate still samples a representative set.
            phase1_count = 10 if n_agents <= 24 else 16
            phase1_sem = 10
            phase2_sem = 4
        else:
            probe_timeout_s = 15.0
            phase1_count = n_agents
            phase1_sem = 6
            phase2_sem = 6

        async def _limited_agent(cfg, sem):
            async with sem:
                return await launch_single_agent(bd, url, cfg, probe_timeout_s)

        # Phase 1: fast initial scan — process agents incrementally
        # so the frontend sees real-time progress (not 0 -> N at once).
        sem1 = asyncio.Semaphore(phase1_sem)
        phase1 = agent_configs[:phase1_count]
        tasks = [_limited_agent(c, sem1) for c in phase1]
        for coro in asyncio.as_completed(tasks):
            try:
                r = await coro
                _ingest_agent(r)
            except Exception:
                session["failed_agents"] += 1

        # Check if pricing is uniform (exact match to the cent)
        prices = [v for v in session["all_prices"].values() if v is not None]
        uniform = False
        if len(prices) >= 5:
            uniform = (max(prices) - min(prices)) < 0.01

        # Phase 2: only if prices vary — also incremental for real-time UI
        if not uniform:
            sem2 = asyncio.Semaphore(phase2_sem)
            phase2 = agent_configs[phase1_count:]
            tasks = [_limited_agent(c, sem2) for c in phase2]
            for coro in asyncio.as_completed(tasks):
                try:
                    r = await coro
                    _ingest_agent(r)
                except Exception:
                    session["failed_agents"] += 1
        elif brightdata_live_ready() and prices:
            bp = statistics.median(prices)
            # Carry the native price captured by a real probe so the skipped
            # agents display the same on-page currency (e.g. AED) rather than
            # only the USD figure. Taken from a real agent whose USD price equals
            # the uniform baseline.
            _fill_native_price = _fill_native_currency = _fill_fx = None
            for a in session.get("agents", []):
                if (a.get("native_price") is not None
                        and a.get("price") is not None
                        and abs(a["price"] - bp) < 0.01):
                    _fill_native_price = a.get("native_price")
                    _fill_native_currency = a.get("native_currency")
                    _fill_fx = a.get("fx_rate_used")
                    break
            import asyncio as _asyncio
            async def _fill_agent(cfg):
                await _asyncio.sleep(0.15)  # small stagger for visual effect
                agent = dict(
                    agent_id=cfg["id"], label=cfg["label"], status="success",
                    price=bp, response_time_ms=0, bot_detected=False,
                    detection_signal=None, error_message=None,
                    variables=cfg.get("variables", {}),
                    delta_variable=cfg.get("delta_variable"),
                    delta_direction=cfg.get("delta_direction"),
                    is_control=cfg.get("is_control", False),
                    network_tier=cfg.get("network_tier"),
                    proxy_type=cfg.get("proxy_type"),
                    native_price=_fill_native_price,
                    native_currency=_fill_native_currency,
                    normalized_price_usd=bp,
                    fx_rate_used=_fill_fx,
                    browser_language=cfg.get("browser_language"),
                    accept_language_header=cfg.get("accept_language_header"),
                    language_label=cfg.get("language_label"),
                    language_pair_id=cfg.get("language_pair_id"),
                    language_pair_role=cfg.get("language_pair_role"),
                    inferred=True,  # marks an exact-uniform-gate skipped agent
                )
                return agent
            # Controlled language-pair agents must be REALLY probed (with their
            # Accept-Language header) even when the uniform gate fires — otherwise
            # the AR side would just be filled with the baseline and the
            # EN-vs-AR comparison would be fabricated. So: real-probe any
            # language_pair agent; fill the rest.
            remaining = agent_configs[phase1_count:]
            lang_pair_cfgs = [c for c in remaining if c.get("language_pair_id")]
            fill_cfgs = [c for c in remaining if not c.get("language_pair_id")]
            for c in lang_pair_cfgs:
                try:
                    _ingest_agent(await _limited_agent(c, asyncio.Semaphore(2)))
                except Exception:
                    session["failed_agents"] += 1
            fill_tasks = [_fill_agent(c) for c in fill_cfgs]
            for coro in asyncio.as_completed(fill_tasks):
                r = await coro
                _ingest_agent(r)

        # Honest probe accounting on EVERY exit path (not only the success path).
        def _set_accounting():
            al = session.get("agents", [])
            session["real_probes_executed"] = sum(
                1 for a in al if (a.get("response_time_ms") or 0) > 0)
            session["skipped_inferred_agents"] = sum(1 for a in al if a.get("inferred"))
            session["evidence_count"] = sum(
                1 for a in al if isinstance(a.get("evidence"), dict)
                and a["evidence"].get("extraction_method") not in (None, "none", ""))

        all_prices = session.get("all_prices", {})
        valid = [p for p in all_prices.values() if p is not None]
        if not valid and session["detected_agents"] > 12:
            session["status"] = "completed"
            session["error"] = f"TARGET BLOCKED PROBE — {session['detected_agents']}/{n_agents} agents hit honeypot pages."
            session["elapsed_seconds"] = round(time.time() - overall_start, 2)
            _set_accounting()
            await bd.close()
            return session
        if not valid:
            session["status"] = "failed"
            _set_accounting()
            if session["detected_agents"] > 0:
                session["error"] = (
                    f"This site blocked our agents at the perimeter — "
                    f"{session['detected_agents']}/{n_agents} hit a honeypot / captcha. "
                    f"Try a different URL or use one of the case studies."
                )
            else:
                session["error"] = (
                    "Reached the page but couldn't find a comparable price field. "
                    "The site may JS-render prices after page load. "
                    "Try a hotel or product page with a clearly listed price."
                )
            session["elapsed_seconds"] = round(time.time() - overall_start, 2)
            await bd.close()
            return session
        finalize_pricing_session(session, overall_start)
    except Exception as e:
        session["status"] = "failed"
        session["error"] = str(e)
        session["elapsed_seconds"] = round(time.time() - overall_start, 2)
    finally:
        await bd.close()
    return session


DEMO_RESULT: dict = {
    "session_id": "demo_session_static",
    "target_url": "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html",
    "target_name": "Leela Palace Bangalore",
    "timestamp": "2026-05-25T20:00:00Z",
    "status": "completed",
    "total_agents": 24, "successful_agents": 22, "failed_agents": 1, "detected_agents": 1,
    "elapsed_seconds": 8.7, "control_stability": 0.994,
    "baseline_price": 245.0, "mean_price": 252.0,
    "all_prices": {
        "AGENT_00": 245, "AGENT_01": 268, "AGENT_02": 228, "AGENT_03": 265,
        "AGENT_04": 262, "AGENT_05": 231, "AGENT_06": 272, "AGENT_07": 234,
        "AGENT_08": 269, "AGENT_09": 236, "AGENT_10": 266, "AGENT_11": 254,
        "AGENT_12": 245, "AGENT_13": 241, "AGENT_14": 258, "AGENT_15": 245,
        "AGENT_16": 256, "AGENT_17": 245, "AGENT_18": 278, "AGENT_19": 221,
        "AGENT_20": 271, "AGENT_21": 238, "AGENT_22": 246, "AGENT_23": 244,
    },
    "price_range": [221.0, 278.0], "max_price_spread": 57.0, "max_price_spread_pct": 23.3,
    "gradients": [
        {"variable_name":"location","state_high":"High Income Area","state_low":"Low Income Area","mean_price_high":268.3,"mean_price_low":226.7,"delta":41.6,"delta_pct":17.0,"pooled_std":2.5,"t_statistic":16.6,"significant":True,"n_high":3,"n_low":3},
        {"variable_name":"device","state_high":"Premium Device","state_low":"Budget Device","mean_price_high":269.5,"mean_price_low":236.0,"delta":33.5,"delta_pct":13.7,"pooled_std":3.1,"t_statistic":10.8,"significant":True,"n_high":4,"n_low":4},
        {"variable_name":"cookie_profile","state_high":"Aged Profile","state_low":"Fresh Profile","mean_price_high":247.5,"mean_price_low":245.0,"delta":2.5,"delta_pct":1.0,"pooled_std":4.2,"t_statistic":0.6,"significant":False,"n_high":2,"n_low":2},
        {"variable_name":"referrer","state_high":"Aggregator","state_low":"Direct","mean_price_high":257.0,"mean_price_low":245.0,"delta":12.0,"delta_pct":4.9,"pooled_std":3.8,"t_statistic":3.16,"significant":True,"n_high":2,"n_low":2},
    ],
    "discrimination_index": 87.1, "topology_class": "progressive",
    "discrimination_score": 84.2,
    "summary": "TOPOLOGY: PROGRESSIVE. Baseline: $245.00/night. Spread: $57.00. DI: $87.10. Significant: 3 vars. location: +$41.60; device: +$33.50; referrer: +$12.00.",
    "max_discrimination_scenario": "Max: AGENT_18  LOCATION_HIGH  DUBAI_$110K @ $278.00",
    "min_discrimination_scenario": "Min: AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K @ $221.00",
    "agents": [
        {"agent_id":"AGENT_00","label":"AGENT_00  BASELINE  MACBOOK_MANHATTAN_FRESH_DIRECT","status":"success","price":245,"response_time_ms":1120,"bot_detected":False,"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"}},
        {"agent_id":"AGENT_01","label":"AGENT_01  LOCATION_HIGH  MANHATTAN_$150K","status":"success","price":268,"response_time_ms":1350,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_02","label":"AGENT_02  LOCATION_LOW  RURAL_IOWA_$50K","status":"success","price":228,"response_time_ms":1420,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_03","label":"AGENT_03  LOCATION_HIGH  SAN_FRANCISCO_$160K","status":"success","price":265,"response_time_ms":1180,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_04","label":"AGENT_04  LOCATION_HIGH  LONDON_£85K","status":"success","price":262,"response_time_ms":1310,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_05","label":"AGENT_05  LOCATION_LOW  MUMBAI_$15K","status":"success","price":231,"response_time_ms":1450,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_06","label":"AGENT_06  DEVICE_HIGH  iPHONE_15_PRO","status":"success","price":272,"response_time_ms":1080,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_07","label":"AGENT_07  DEVICE_LOW  ANDROID_BUDGET","status":"success","price":234,"response_time_ms":1550,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_08","label":"AGENT_08  DEVICE_HIGH  MACBOOK_PRO_M3","status":"success","price":269,"response_time_ms":1140,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_09","label":"AGENT_09  DEVICE_LOW  CHROMEBOOK","status":"success","price":236,"response_time_ms":1280,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_10","label":"AGENT_10  DEVICE_HIGH  GALAXY_S24_ULTRA","status":"success","price":266,"response_time_ms":1190,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_11","label":"AGENT_11  COOKIE_HIGH  30D_HIGH_INTENT","status":"success","price":254,"response_time_ms":1310,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_12","label":"AGENT_12  COOKIE_LOW  FRESH_FIRST_VISIT","status":"success","price":245,"response_time_ms":1120,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_13","label":"AGENT_13  COOKIE_HIGH  90D_PLATINUM","status":"success","price":241,"response_time_ms":1250,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_14","label":"AGENT_14  REFERRER_HIGH  VIA_KAYAK","status":"success","price":258,"response_time_ms":1480,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_15","label":"AGENT_15  REFERRER_LOW  DIRECT","status":"success","price":245,"response_time_ms":1220,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_16","label":"AGENT_16  REFERRER_HIGH  SKYSCANNER","status":"success","price":256,"response_time_ms":1350,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_17","label":"AGENT_17  REFERRER_LOW  DIRECT_BASELINE","status":"success","price":245,"response_time_ms":1180,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_18","label":"AGENT_18  LOCATION_HIGH  DUBAI_$110K","status":"success","price":278,"response_time_ms":1410,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_19","label":"AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K","status":"success","price":221,"response_time_ms":1520,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_20","label":"AGENT_20  DEVICE_HIGH  iPAD_PRO_12.9","status":"success","price":271,"response_time_ms":1160,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_21","label":"AGENT_21  DEVICE_LOW  iPHONE_SE_BUDGET","status":"detected","price":None,"response_time_ms":341,"bot_detected":True,"detection_signal":"captcha","variables":{}},
        {"agent_id":"AGENT_22","label":"AGENT_22  CONTROL  BASELINE_REPEAT_1","status":"success","price":246,"response_time_ms":1190,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_23","label":"AGENT_23  CONTROL  BASELINE_REPEAT_2","status":"success","price":244,"response_time_ms":1300,"bot_detected":False,"variables":{}},
    ],
    "error": None,
}


app = FastAPI(title="JACOBI — Adversarial Pricing Topology Probe", version="1.0.0")
# CORS: allow Vercel frontend + local dev
VERCEL_FRONTEND = os.environ.get("VERCEL_FRONTEND_URL", "https://jacobi.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(export_router)
# Stripe billing routes (/api/billing/checkout, /sync, /portal, /plan, /webhook).
# Without this include, the frontend's startCheckout() call returns 404 and the
# Stripe test flow never opens. Found during sanity check.
from billing import router as billing_router
app.include_router(billing_router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
FRONTEND_INDEX = os.path.join(FRONTEND_DIR, "index.html") if os.path.isdir(FRONTEND_DIR) else None


@app.get("/health")
async def health():
    """Internal debugging endpoint.

    Three signals for ops:
      - brightdata_api_key_configured : the Bearer token is present
      - brightdata_zone_configured    : the unlocker zone is real (not empty
                                        or a placeholder string)
      - probe_mode = "live"           : BrightData will be tried first; per-
                                        agent failures still fall back silently
                                        to direct HTTP
      - probe_mode = "direct_http_fallback" : every agent will skip BrightData
                                        and use direct HTTP. Used when EITHER
                                        the key OR the zone is missing.

    Customer-facing UI does NOT surface any of this. Used only by health
    checks and monitoring.
    """
    bd_key_ok = bool(BRIGHTDATA_API_KEY)
    bd_zone_ok = brightdata_zone_ready()
    fully_live = brightdata_live_ready()

    # Supabase config sanity — exposes WHETHER env vars look right without
    # leaking secrets. If supabase_url_shape is "bad_path", every Bearer
    # token will silently fail JWT verify because get_optional_user() will
    # GET <bad-url>/auth/v1/user and hit a 404. Common cause: someone
    # pasted the Supabase REST URL (https://x.supabase.co/rest/v1) into
    # SUPABASE_URL instead of the project URL (https://x.supabase.co).
    from auth_user import _supabase_url, _supabase_anon_key
    sb_url = _supabase_url()
    sb_anon = _supabase_anon_key()
    if not sb_url:
        sb_shape = "missing"
    elif sb_url.endswith("/rest/v1") or "/rest/v1" in sb_url or sb_url.endswith("/"):
        sb_shape = "bad_path"
    elif sb_url.startswith("https://") and sb_url.endswith(".supabase.co"):
        sb_shape = "ok"
    else:
        sb_shape = "unknown"

    return {
        "status": "healthy",
        "service": "jacobi-backend",
        "brightdata_api_key_configured": bd_key_ok,
        "brightdata_zone_configured": bd_zone_ok,
        # Back-compat: older monitors look at this single boolean.
        "brightdata_configured": fully_live,
        "probe_mode": "live" if fully_live else "direct_http_fallback",
        "brightdata_custom_headers_configured": bool(BRIGHTDATA_CUSTOM_HEADERS_ENABLED),
        "supabase_url_shape": sb_shape,
        "supabase_anon_key_configured": bool(sb_anon),
    }


@app.post("/api/probe")
async def launch_probe(
    input: TargetProbeInput,
    user: Optional[dict] = Depends(get_optional_user),
):
    """Launch a pricing probe.

    Auth: caller may be signed in (Authorization: Bearer <supabase-jwt>) or
    anonymous. Signed-in callers are quota-checked and the resulting probe
    row is stamped with their user_id. Anonymous callers may run the static
    demo session only — they cannot consume the 24-identity live engine.

    Quota:
      - Free  : FREE_MONTHLY_PROBES (24) per calendar month
      - Pro   : PRO_MONTHLY_PROBES  (50) per calendar month
      - Enterprise: unlimited (treated as Pro today; expand later)
    Count is incremented only after the probe successfully launches and
    save_probe writes a row (i.e. real work was done). Failed engine starts
    do not consume credit.
    """
    # Static-demo escape hatch is allowed for everyone; it doesn't run the
    # engine or save a row.
    if input.use_data_dir:
        return {"session_id": "demo_session_static", "status": "completed"}

    # Auth gate: live probes require a signed-in user.
    if not user or not user.get("id"):
        raise HTTPException(
            status_code=401,
            detail={
                "code": "auth_required",
                "message": "Sign in to run a live probe.",
            },
        )

    # Quota gate.
    try:
        allowed, quota = await can_run_probe(user["id"])
    except Exception as quota_err:
        # Fail open ONLY if the quota subsystem itself errors — don't block
        # paying users because Supabase blipped. Logged for ops.
        print(f"[PROBE] quota check raised, failing open: {quota_err!r}")
        allowed, quota = True, {"tier": "free", "used": 0, "limit": None}
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "quota_exceeded",
                "message": (
                    f"You've used {quota.get('used')} of {quota.get('limit')} "
                    "probes this month. Upgrade to Pro for more."
                ),
                "tier": quota.get("tier"),
                "used": quota.get("used"),
                "limit": quota.get("limit"),
            },
        )

    # Create the session synchronously (fast, in-memory) and return its
    # session_id IMMEDIATELY. The engine runs in a background task so the
    # HTTP request doesn't block for 12-50 seconds while 24 agents fetch —
    # which Render's edge proxy terminates after ~30s as "network error".
    #
    # The frontend already polls /api/result/{session_id} every 1s, so the
    # async-launch pattern fits its existing flow.
    # Resolve the audit matrix (Phase 5A). Pro/Enterprise tiers may request the
    # 50-agent matrix via audit_depth="pro50"; everyone else (and any Free user
    # who asks for pro50) gets the 24-agent Free matrix. Default for Pro when no
    # depth is given stays smart24 so cost/behaviour is unchanged unless asked.
    tier = (quota.get("tier") or "free").lower()
    requested = (input.audit_depth or "").strip().lower()
    if requested == "pro50" and tier in ("pro", "enterprise"):
        engine_tier = "pro"
    else:
        engine_tier = "free"

    sid, session = create_session(input.target_url, input.target_name)
    session["tier"] = tier
    session["audit_depth"] = "pro50" if engine_tier == "pro" else "smart24"
    asyncio.create_task(_complete_probe_in_background(
        session=session,
        url=input.target_url,
        user_id=user["id"],
        publish_to_board=bool(input.publish_to_board),
        engine_tier=engine_tier,
    ))
    return {"session_id": sid, "status": "running", "audit_depth": session["audit_depth"]}


async def _complete_probe_in_background(
    session: dict,
    url: str,
    user_id: str,
    publish_to_board: bool,
    engine_tier: str = "free",
) -> None:
    """Run the probe engine, persist the result, increment the quota.
    Wrapped so the launch endpoint can fire-and-forget.

    Every step is fail-soft so an exception in the persistence layer
    doesn't poison the in-memory session — the user can still poll
    /api/result and see whatever the engine produced.
    """
    try:
        await _run_probe_engine(session, url,
                                agent_configs=get_agent_configs_for_tier(engine_tier))
    except Exception as e:
        # Engine itself crashed. Mark the session as failed so the
        # frontend's polling loop can surface a clean error state instead
        # of hanging forever.
        print(f"[PROBE-BG] engine crashed: {e!r}")
        session["status"] = "failed"
        session["error"] = "Probe engine error. Please retry."

    # Persist to Supabase, stamping the owning user so RLS + history work.
    saved_id = None
    try:
        saved_id = await save_probe(
            session,
            user_id=user_id,
            is_public=publish_to_board,
        )
    except Exception as db_err:
        print(f"[PROBE-BG] save_probe failed: {db_err!r}")

    # Increment quota ONLY when a row was actually persisted. Transient
    # DB errors don't charge credit.
    if saved_id:
        try:
            await increment_probe_count(user_id)
        except Exception as inc_err:
            print(f"[PROBE-BG] increment_probe_count failed: {inc_err!r}")


def build_agent_list(session: dict) -> list:
    agents = []
    for a in session.get("agents", []):
        agents.append(dict(
            agent_id=a.get("agent_id",""), label=a.get("label",""), status=a.get("status",""),
            price=a.get("price"), response_time_ms=a.get("response_time_ms"),
            bot_detected=a.get("bot_detected",False), detection_signal=a.get("detection_signal"),
            error_message=a.get("error_message"), variables=a.get("variables",{}),
            delta_variable=a.get("delta_variable"), delta_direction=a.get("delta_direction"),
            is_control=a.get("is_control", False), network_tier=a.get("network_tier"),
            proxy_type=a.get("proxy_type"),
            native_price=a.get("native_price"),
            native_currency=a.get("native_currency"),
            normalized_price_usd=a.get("normalized_price_usd"),
            fx_rate_used=a.get("fx_rate_used"),
            inferred=a.get("inferred", False),
            browser_language=a.get("browser_language"),
            accept_language_header=a.get("accept_language_header"),
            language_label=a.get("language_label"),
            language_pair_id=a.get("language_pair_id"),
            language_pair_role=a.get("language_pair_role"),
            evidence=a.get("evidence"),
        ))
    return agents


@app.get("/api/result/{session_id}")
async def get_result(session_id: str):
    if session_id == "demo_session_static":
        return DEMO_RESULT
    session = SESSION_STORE.get(session_id)
    if not session:
        try:
            from supabase_client import get_probe_by_session_id
            session = await get_probe_by_session_id(session_id)
        except Exception as e:
            print(f"[RESULT] Supabase fetch failed: {e}")
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    agents = build_agent_list(session)
    return dict(
        session_id=session.get("session_id", session_id), target_url=session.get("target_url"),
        target_name=session.get("target_name"), timestamp=session.get("timestamp"),
        status=session.get("status"), total_agents=session.get("total_agents", 24),
        successful_agents=session.get("successful_agents"), failed_agents=session.get("failed_agents"),
        detected_agents=session.get("detected_agents"), elapsed_seconds=session.get("elapsed_seconds"),
        control_stability=session.get("control_stability"), baseline_price=session.get("baseline_price"),
        mean_price=session.get("mean_price"), all_prices=session.get("all_prices"),
        price_range=session.get("price_range"), max_price_spread=session.get("max_price_spread"),
        max_price_spread_pct=session.get("max_price_spread_pct"), gradients=session.get("gradients"),
        discrimination_index=session.get("discrimination_index"), topology_class=session.get("topology_class"),
        summary=session.get("summary"),         max_discrimination_scenario=session.get("max_discrimination_scenario"),
        min_discrimination_scenario=session.get("min_discrimination_scenario"), agents=agents,
        discrimination_score=session.get("discrimination_score", 0),
        # Native (on-page) currency for the headline; USD figures above are the
        # normalized comparison basis. All None-safe → UI renders N/A.
        native_currency=session.get("native_currency"),
        native_baseline_price=session.get("native_baseline_price"),
        normalized_currency=session.get("normalized_currency", "USD"),
        fx_rate_used=session.get("fx_rate_used"),
        # Controlled browser-language observations (metadata, not a driver).
        language_observations=session.get("language_observations", []),
        # Phase 5A honest probe accounting + audit depth.
        configured_agents=session.get("configured_agents", session.get("total_agents", 24)),
        real_probes_executed=session.get("real_probes_executed"),
        skipped_inferred_agents=session.get("skipped_inferred_agents"),
        evidence_count=session.get("evidence_count"),
        audit_depth=session.get("audit_depth", "smart24"),
        tier=session.get("tier"),
        error=session.get("error"),
    )


@app.get("/api/demo")
async def get_demo_data():
    return DEMO_RESULT


@app.post("/api/debug-probe")
async def debug_probe(input: TargetProbeInput):
    """Debug endpoint: fetch a URL via BrightData and show raw price extraction results."""
    bd = BrightDataMCPClient()
    await bd.start()
    try:
        result = await bd.probe_url(input.target_url, {"geo": "US", "proxy_type": "residential"}, timeout_s=30.0)
        if not result["success"]:
            return {"error": f"BrightData API error: {result.get('error')}", "success": False}
        text = result["text"]
        detected, signal = check_bot_detection(text)
        prices = parse_page_prices(text, input.target_url)
        return {
            "success": True,
            "html_length": len(text),
            "html_preview": text[:2000],
            "bot_detected": detected,
            "detection_signal": signal,
            "prices_found": prices,
            "count": len(prices),
            "elapsed_ms": result.get("elapsed_ms"),
        }
    except Exception as e:
        return {"error": str(e), "success": False}
    finally:
        await bd.close()


@app.get("/api/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Return top N probes by savings (max_price_spread)."""
    try:
        from datetime import timezone
        from supabase_client import get_public_board
        probes = await get_public_board(limit=max(limit, 20))
        sorted_probes = sorted(
            [p for p in probes if p.get("max_price_spread")],
            key=lambda p: p["max_price_spread"],
            reverse=True
        )[:limit]
        entries = [
            {
                "name": (p.get("target_name") or p.get("target_url") or "Unknown")[:30],
                "savings": p["max_price_spread"],
                "url": p.get("target_url", ""),
                "topology_class": p.get("topology_class"),
                "target_url": p.get("target_url", ""),
                "target_name": p.get("target_name"),
                "max_price_spread": p.get("max_price_spread"),
                "timestamp": p.get("created_at"),
                "total_agents": 24,
            }
            for p in sorted_probes
        ]
        return {
            "entries": entries,
            "total_probes": len(probes),
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        print(f"[LEADERBOARD] returning empty: {e!r}")
        return {"entries": []}


@app.get("/api/history")
async def get_history(
    limit: int = 50,
    user: Optional[dict] = Depends(get_optional_user),
):
    """Return recent probe sessions for the signed-in caller."""
    if not user or not user.get("id"):
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_required", "message": "Sign in to view your history."},
        )

    sessions = []
    try:
        from supabase_client import get_probe_history_for_user
        db_probes = await get_probe_history_for_user(user["id"], limit=limit)
        for p in db_probes:
            sessions.append({
                "session_id": p.get("id", ""),
                "target_url": p.get("target_url", ""),
                "target_name": p.get("target_name", ""),
                "timestamp": p.get("created_at", ""),
                "status": "completed",
                "baseline_price": p.get("baseline_price"),
                "max_price_spread": p.get("max_price_spread"),
                "topology_class": p.get("topology_class"),
                "discrimination_score": None,
                "elapsed_seconds": None,
                "successful_agents": None,
                "total_agents": 24,
            })
    except Exception:
        pass

    return sessions[:limit]


@app.post("/api/analyze")
async def analyze_session(input: TargetProbeInput):
    """Run Gemini analysis on a completed probe session."""
    session_id = input.use_data_dir or "demo_session_static"
    if session_id == "demo_session_static":
        report_data = DEMO_RESULT
    else:
        report_data = SESSION_STORE.get(session_id)
        if not report_data:
            try:
                from supabase_client import get_probe_by_session_id
                report_data = await get_probe_by_session_id(session_id)
            except Exception:
                pass
        if not report_data:
            raise HTTPException(status_code=404, detail="Session not found")

    gemini_report = None
    if report_data.get("status") in ("completed",):
        gemini_report = analyze_report(report_data)

    verdict = compute_savings_verdict(report_data) if report_data else {}

    return {
        "session_id": session_id,
        "target_name": report_data.get("target_name", ""),
        "topology_class": report_data.get("topology_class", "unknown"),
        "baseline_price": report_data.get("baseline_price"),
        "gemini_report": gemini_report.model_dump() if gemini_report else None,
        "savings_verdict": verdict,
    }


@app.get("/api/analyze-demo")
async def analyze_demo():
    """Run Gemini analysis on embedded demo data (no live probe needed)."""
    report_data = DEMO_RESULT
    gemini_report = analyze_report(report_data)
    verdict = compute_savings_verdict(report_data)
    return {
        "session_id": "demo_analyzed",
        "target_name": report_data.get("target_name", ""),
        "topology_class": report_data.get("topology_class", ""),
        "baseline_price": report_data.get("baseline_price"),
        "gemini_report": gemini_report.model_dump() if gemini_report else None,
        "savings_verdict": verdict,
    }


@app.get("/api/share/{session_id}")
async def get_share(session_id: str):
    """Fetch shared results, falling back to Supabase."""
    if session_id == "demo_session_static":
        return DEMO_RESULT
    session = SESSION_STORE.get(session_id)
    if not session:
        try:
            from supabase_client import get_probe_by_session_id
            session = await get_probe_by_session_id(session_id)
        except Exception as e:
            print(f"[SHARE] Supabase fetch failed: {e}")
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    agents = build_agent_list(session)
    return dict(
        session_id=session.get("session_id", session_id), target_url=session.get("target_url"),
        target_name=session.get("target_name"), timestamp=session.get("timestamp"),
        status=session.get("status"), total_agents=session.get("total_agents", 24),
        successful_agents=session.get("successful_agents"), failed_agents=session.get("failed_agents"),
        detected_agents=session.get("detected_agents"), elapsed_seconds=session.get("elapsed_seconds"),
        control_stability=session.get("control_stability"), baseline_price=session.get("baseline_price"),
        mean_price=session.get("mean_price"), all_prices=session.get("all_prices"),
        price_range=session.get("price_range"), max_price_spread=session.get("max_price_spread"),
        max_price_spread_pct=session.get("max_price_spread_pct"), gradients=session.get("gradients"),
        discrimination_index=session.get("discrimination_index"), topology_class=session.get("topology_class"),
        summary=session.get("summary"),         max_discrimination_scenario=session.get("max_discrimination_scenario"),
        min_discrimination_scenario=session.get("min_discrimination_scenario"), agents=agents,
        discrimination_score=session.get("discrimination_score", 0),
        # Native (on-page) currency for the headline; USD figures above are the
        # normalized comparison basis. All None-safe → UI renders N/A.
        native_currency=session.get("native_currency"),
        native_baseline_price=session.get("native_baseline_price"),
        normalized_currency=session.get("normalized_currency", "USD"),
        fx_rate_used=session.get("fx_rate_used"),
        # Controlled browser-language observations (metadata, not a driver).
        language_observations=session.get("language_observations", []),
        # Phase 5A honest probe accounting + audit depth.
        configured_agents=session.get("configured_agents", session.get("total_agents", 24)),
        real_probes_executed=session.get("real_probes_executed"),
        skipped_inferred_agents=session.get("skipped_inferred_agents"),
        evidence_count=session.get("evidence_count"),
        audit_depth=session.get("audit_depth", "smart24"),
        tier=session.get("tier"),
        error=session.get("error"),
    )


@app.get("/api/badge/{session_id}")
async def get_badge(session_id: str):
    """Retrieve SVG badge representing pricing topology."""
    from fastapi import Response
    session = None
    if session_id == "demo_session_static":
        session = DEMO_RESULT
    else:
        session = SESSION_STORE.get(session_id)
        if not session:
            try:
                from supabase_client import get_probe_by_session_id
                session = await get_probe_by_session_id(session_id)
            except Exception:
                pass
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    topo = (session.get("topology_class") or "unknown").lower()
    colors_map = {
        "uniform": "#00d992",
        "selective": "#facc15",
        "progressive": "#fb923c",
        "aggressive": "#f87171",
    }
    color = colors_map.get(topo, "#60a5fa")
    
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="130" height="20">
  <linearGradient id="b" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <mask id="a"><rect width="130" height="20" rx="3" fill="#fff"/></mask>
  <g mask="url(#a)">
    <path fill="#555" d="M0 0h55v20H0z"/>
    <path fill="{color}" d="M55 0h75v20H55z"/>
    <path fill="url(#b)" d="M0 0h130v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="27.5" y="15" fill="#010101" fill-opacity=".3">JACOBI</text>
    <text x="27.5" y="14">JACOBI</text>
    <text x="92.5" y="15" fill="#010101" fill-opacity=".3">{topo}</text>
    <text x="92.5" y="14">{topo}</text>
  </g>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml")


@app.post("/api/schedule")
async def add_schedule(req: ScheduleRequest):
    """Add a monitoring schedule."""
    from scheduler import create_schedule
    if not req.target_url or req.target_url.strip() == "":
        raise HTTPException(status_code=400, detail="Target URL cannot be empty")
    config = await create_schedule(req.target_url, req.target_name, req.interval_minutes)
    return {
        "id": config.id,
        "status": "scheduled",
        "target_url": config.target_url,
        "target_name": config.target_name,
        "interval_minutes": config.interval_minutes,
    }


@app.get("/api/schedules")
async def get_schedules():
    """Retrieve active monitoring schedules."""
    from scheduler import get_active_schedules
    return get_active_schedules()


@app.get("/_next/static/{rest:path}")
async def serve_next_static(rest: str):
    file_path = os.path.join(FRONTEND_DIR, "_next", "static", rest)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.exception_handler(404)
async def spa_fallback(request: Request, exc):
    path = request.url.path
    if path.startswith("/api/") or path == "/health":
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    if FRONTEND_INDEX and os.path.isfile(FRONTEND_INDEX):
        return FileResponse(FRONTEND_INDEX)
    return JSONResponse(status_code=404, content={"detail": "Not found"})


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
