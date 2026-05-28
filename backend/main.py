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
from collections import defaultdict, deque
from datetime import datetime
from typing import Optional, Dict, List, Tuple

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from gemini_analyzer import analyze_report, GeminiReport
from report_export import router as export_router
from savings_verdict import compute_savings_verdict
from supabase_client import save_probe
from cognee_memory import remember_probe, is_available as cognee_available
from billing import router as billing_router
from auth_user import get_optional_user
from profile_store import can_run_probe, increment_probe_count, get_tier

load_dotenv()
BRIGHTDATA_API_KEY = os.getenv("BRIGHTDATA_API_KEY", "")


class TargetProbeInput(BaseModel):
    target_url: str = Field(..., description="Full URL of the target product page")
    target_name: str = Field(default="UA123 JFK→SFO", description="Human-readable target label")
    use_data_dir: Optional[str] = Field(default=None, description="Load pre-cached demo data instead of live probe")


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
    retried: bool = False


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
    "booking.com": {"min": 5, "max": 250000},
    "agoda.com": {"min": 5, "max": 250000},
    "expedia": {"min": 5, "max": 50000},
    "hotels.com": {"min": 5, "max": 50000},
    "flydubai": {"min": 5, "max": 20000},
    "united": {"min": 5, "max": 20000},
    "delta": {"min": 5, "max": 20000},
    "emirates": {"min": 5, "max": 50000},
    "amazon": {"min": 1, "max": 50000},
    "default": {"min": 1, "max": 500000},
}

# ─── Site-Specific Price Parser Registry ──────────────────────────────────
# Allows registering custom parsers for domains where the generic
# CSS-selector approach fails (e.g. Google Flights, Expedia, Shopify sites).

_SITE_PARSERS: Dict[str, callable] = {}


def register_site_parser(domain: str, parser_func: callable):
    """Register a custom price-parsing function for a specific domain.

    The parser receives (html: str, url: str) and must return List[float].
    When `parse_page_prices` is called, registered parsers are checked
    first (by substring match against the URL) before the default logic.
    """
    _SITE_PARSERS[domain] = parser_func


# ─── Built-in Site Parsers ───────────────────────────────────────────────

def _parse_google_flights(html: str, url: str) -> List[float]:
    """Extract flight prices from Google Flights result pages.

    Relies on regex patterns for currency amounts near
    'total', 'price', and 'fare' keywords in visible text.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    results: List[float] = []
    visible = soup.get_text()
    currency_code, rate = _detect_currency(html, url)
    pr = PRICE_RANGES["default"]

    # Look for price amounts close to flight-related keyword anchors
    for kw in ["total", "price", "fare", "round trip", "one way", "per person"]:
        idx = 0
        while True:
            idx = visible.lower().find(kw, idx)
            if idx == -1:
                break
            # Search a 120-char window around the keyword
            window = visible[max(0, idx - 20):idx + len(kw) + 100]
            for m in re.finditer(r'\$\s*(\d{2,4}(?:,\d{3})*(?:\.\d{2})?)', window):
                try:
                    v = float(m.group(1).replace(",", ""))
                    if pr["min"] <= v <= pr["max"]:
                        results.append(round(v * rate, 2))
                except ValueError:
                    continue
            idx += len(kw)

    return sorted(set(results))


def _parse_expedia(html: str, url: str) -> List[float]:
    """Extract hotel/flight prices from Expedia pages.

    Targets data-testid price attributes and JSON-LD structured data
    which Expedia renders reliably across its geo-variants.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    results: List[float] = []
    currency_code, rate = _detect_currency(html, url)
    pr = PRICE_RANGES["expedia"]

    # data-testid price elements (Expedia's primary price rendering)
    for sel in [
        '[data-testid="price-summary"]',
        '[data-testid*="price"]',
        '[data-testid*="total"]',
        '[data-stid*="price"]',
        'span[class*="uitk-lockup-price"]',
        'div[class*="uitk-price"]',
        '[data-testid*="offer-card"] [class*="price"]',
    ]:
        for el in soup.select(sel):
            t = el.get_text(strip=True)
            if t and len(t) < 80:
                n = _parse_number(t)
                if n and pr["min"] <= n <= pr["max"]:
                    results.append(round(n * rate, 2))

    # JSON-LD structured data
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string)
            items = [data] if isinstance(data, dict) else data if isinstance(data, list) else []
            for item in items:
                if isinstance(item, dict):
                    for key in ["price", "lowPrice", "highPrice", "totalPrice"]:
                        v = _parse_number(str(item.get(key, "0")))
                        if v and v > 5:
                            cur = str(item.get("priceCurrency", currency_code))
                            r = CURRENCY_RATES.get(cur, 1.0) if cur != "USD" else 1.0
                            results.append(round(v * r, 2))
        except Exception:
            pass

    return sorted(set(results))


def _parse_generic_ecommerce(html: str, url: str) -> List[float]:
    """Extract prices from generic e-commerce pages via meta tags and JSON-LD.

    Many Shopify/WooCommerce/BigCommerce sites expose prices through
    og:price:amount / product:price:amount meta tags and JSON-LD Product
    schemas. This parser targets those before falling back to CSS selectors.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    results: List[float] = []
    currency_code, rate = _detect_currency(html, url)
    pr = PRICE_RANGES["default"]

    # Meta tag price hints (og:price:amount, product:price:amount, etc.)
    for meta in soup.find_all("meta"):
        prop = (meta.get("property", "") or meta.get("name", "")).lower()
        content = meta.get("content", "")
        if not content:
            continue
        if any(kw in prop for kw in ["price:amount", "product:price:amount",
                                       "sale_price:amount", "og:price:amount"]):
            n = _parse_number(content)
            if n and n > 0.5:
                # Check for currency in sibling meta
                cur = "USD"
                for sibling in soup.find_all("meta"):
                    sprop = (sibling.get("property", "") or sibling.get("name", "")).lower()
                    if sprop.replace(":amount", ":currency") == prop.replace(":amount", ":currency"):
                        cur = sibling.get("content", "USD").upper()
                        break
                r = CURRENCY_RATES.get(cur, 1.0) if cur != "USD" else 1.0
                if pr["min"] <= (n * r) <= pr["max"]:
                    results.append(round(n * r, 2))

    # JSON-LD Product/Offer structured data
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string)
            items = [data] if isinstance(data, dict) else data if isinstance(data, list) else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                # Direct price on Product
                for key in ["price", "lowPrice", "highPrice"]:
                    v = _parse_number(str(item.get(key, "0")))
                    if v and v > 0.5:
                        cur = str(item.get("priceCurrency", "USD"))
                        r = CURRENCY_RATES.get(cur, 1.0) if cur != "USD" else 1.0
                        if pr["min"] <= (v * r) <= pr["max"]:
                            results.append(round(v * r, 2))
                # Nested offers
                offers = item.get("offers", item)
                if isinstance(offers, dict):
                    p = _parse_number(str(offers.get("price", "0")))
                    if p and p > 0.5:
                        cur = str(offers.get("priceCurrency", "USD"))
                        r = CURRENCY_RATES.get(cur, 1.0) if cur != "USD" else 1.0
                        if pr["min"] <= (p * r) <= pr["max"]:
                            results.append(round(p * r, 2))
                elif isinstance(offers, list):
                    for offer in offers:
                        if isinstance(offer, dict):
                            p = _parse_number(str(offer.get("price", "0")))
                            if p and p > 0.5:
                                cur = str(offer.get("priceCurrency", "USD"))
                                r = CURRENCY_RATES.get(cur, 1.0) if cur != "USD" else 1.0
                                if pr["min"] <= (p * r) <= pr["max"]:
                                    results.append(round(p * r, 2))
        except Exception:
            pass

    return sorted(set(results))


# Register the built-in site-specific parsers
register_site_parser("google.com/travel/flights", _parse_google_flights)
register_site_parser("google.travel", _parse_google_flights)
register_site_parser("expedia.", _parse_expedia)
register_site_parser("hotels.com", _parse_expedia)  # Expedia-owned, same markup
register_site_parser("vrbo.com", _parse_expedia)      # Expedia-owned
register_site_parser("orbitz.com", _parse_expedia)    # Expedia-owned
register_site_parser("travelocity.com", _parse_expedia)
for ecom_domain in ["shopify.com", "myshopify.com", "bigcommerce.com",
                     "woocommerce", "etsy.com", "ebay.com", "walmart.com",
                     "target.com", "bestbuy.com", "homedepot.com",
                     "costco.com", "wayfair.com", "aliexpress.com",
                     "alibaba.com", "rakuten.com", "newegg.com"]:
    register_site_parser(ecom_domain, _parse_generic_ecommerce)


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


def parse_page_prices(html: str, url: str) -> List[float]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    url_lower = url.lower()
    results: List[float] = []

    # Check site-specific parser registry first — registered parsers take
    # precedence over the generic CSS-selector fallback below.
    for domain_fragment, parser_func in _SITE_PARSERS.items():
        if domain_fragment in url_lower:
            try:
                site_results = parser_func(html, url)
                if site_results:
                    return sorted(set(round(p, 2) for p in site_results))
            except Exception:
                pass  # parser failed — fall through to default logic

    currency_code, rate = _detect_currency(html, url)
    pr = PRICE_RANGES["default"]
    for domain, r in PRICE_RANGES.items():
        if domain in url_lower:
            pr = r
            break

    def store(raw: float, cur: str = currency_code):
        r = CURRENCY_RATES.get(cur, 1.0) if cur != "USD" else 1.0
        conv = round(raw * r, 2)
        if pr["min"] <= conv <= pr["max"]:
            results.append(conv)

    def parse_price_text(el) -> Optional[str]:
        if not el:
            return None
        t = el.get_text(strip=True)
        return t if t else None

    # Always try JSON-LD structured data first — most reliable across sites
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict):
                for key in ['price', 'lowPrice', 'highPrice']:
                    v = _parse_number(str(data.get(key, '0')))
                    if v and v > 5:
                        store(v, str(data.get('priceCurrency', currency_code)))
                offers = data.get('offers', data)
                if isinstance(offers, dict):
                    p = _parse_number(str(offers.get('price', '0')))
                    if p and p > 5:
                        store(p, str(offers.get('priceCurrency', currency_code)))
                    for sub in ['lowPrice', 'highPrice']:
                        v = _parse_number(str(offers.get(sub, '0')))
                        if v and v > 5:
                            store(v, str(offers.get('priceCurrency', currency_code)))
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        p = _parse_number(str(item.get('price', '0')))
                        if p and p > 5:
                            store(p, str(item.get('priceCurrency', currency_code)))
        except Exception:
            pass

    if "booking.com" in url_lower:
        for sel in [
            '[data-testid="price-and-discounted-price"]',
            '[data-testid="price-for-x-nights"]',
            '[data-testid*="rate"]',
            '[data-testid*="room"] span',
            'div[data-testid="hprt-table"] span[class*="price"]',
            'span[class*="bui-price"]',
            '[data-price-currency]',
        ]:
            els = soup.select(sel)
            for el in els:
                t = parse_price_text(el)
                if t and len(t) < 80:
                    n = _parse_number(t)
                    if n and pr["min"] <= n <= pr["max"]:
                        detected_cur = currency_code
                        for sym, c in CURRENCY_SYMBOL_MAP.items():
                            if sym in t:
                                detected_cur = c
                                break
                        store(n, detected_cur)

    elif "amazon" in url_lower:
        for sel in [
            'span.a-price[data-a-size] span.a-offscreen',
            'span.a-price-whole',
            '.a-price .a-offscreen',
        ]:
            for el in soup.select(sel):
                t = parse_price_text(el)
                if t:
                    n = _parse_number(t)
                    if n:
                        store(n, "USD")

    elif any(a in url_lower for a in ["flydubai", "united", "delta", "emirates", "expedia"]):
        for sel in [
            'span[class*="fare"]', 'span[class*="price"]', 'div[class*="price"]',
            '[data-testid*="price"]', '.total-amount', '.amount',
        ]:
            for el in soup.select(sel):
                t = parse_price_text(el)
                if t:
                    n = _parse_number(t)
                    if n and n > 10:
                        detected = currency_code
                        for sym, c in CURRENCY_SYMBOL_MAP.items():
                            if sym in t:
                                detected = c
                                break
                        store(n, detected)

    else:
        for sel in [
            '[data-price]', '[itemprop="price"]', '.price', '.amount',
            '.product-price', '.sale-price', '[class*="price"]',
            '[data-testid*="price"]', '.total',
        ]:
            for el in soup.select(sel):
                t = parse_price_text(el)
                if t and len(t) < 60:
                    n = _parse_number(t)
                    if n and n > 5:
                        detected = currency_code
                        for sym, c in CURRENCY_SYMBOL_MAP.items():
                            if sym in t:
                                detected = c
                                break
                        store(n, detected)

    # Deduplicate and validate
    results = sorted(set(round(p, 2) for p in results))

    # If we have enough structured/selector results, clean outliers
    if len(results) >= 6:
        results.sort()
        cut = max(1, len(results) // 10)
        results = results[cut:-cut]

    # Fallback: regex on visible text when BS finds nothing
    if len(results) < 2:
        visible = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        visible = re.sub(r'<style[^>]*>.*?</style>', '', visible, flags=re.DOTALL | re.IGNORECASE)
        # INR prices (common for Indian hotels like Leela Palace)
        for m in re.finditer(r'(?:₹|INR)\s*(\d[\d,]*)', visible):
            try:
                v = float(m.group(1).replace(",", ""))
                if 500 <= v <= 200000:
                    results.append(round(v * 0.012, 2))
            except ValueError:
                continue
        # USD and major currency prices
        for pat in [
            r'\$\s*(\d{2,6}(?:\.\d{2})?)',
            r'(?:USD|AED|EUR|GBP|QAR|SAR)\s*(\d{2,6}(?:\.\d{2})?)',
        ]:
            for m in re.finditer(pat, visible):
                try:
                    v = float(m.group(1).replace(",", ""))
                    if pr["min"] <= v <= pr["max"]:
                        results.append(round(v, 2))
                except ValueError:
                    continue

    return sorted(set(round(p, 2) for p in results))


def check_bot_detection(text: str) -> Tuple[bool, Optional[str]]:
    t = text.lower()
    for signal in HONEYPOT_SIGNALS:
        if signal in t:
            return True, signal
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
        self._client = httpx.AsyncClient(timeout=65.0)

    async def _direct_http_fetch(self, url: str, identity: dict, timeout_s: float = 60.0) -> dict:
        """Fallback: fetch the URL directly (no BrightData proxy)."""
        import httpx
        start_ts = time.time()
        user_agent = identity.get("user_agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        headers = {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            direct_client = httpx.AsyncClient(timeout=timeout_s, follow_redirects=True)
            try:
                response = await asyncio.wait_for(
                    direct_client.get(url, headers=headers),
                    timeout=timeout_s,
                )
                elapsed_ms = int((time.time() - start_ts) * 1000)
                if response.status_code in (200, 201, 202, 301, 302, 304):
                    return {"success": True, "text": response.text, "elapsed_ms": elapsed_ms,
                            "_fallback": "direct_http"}
                return {"success": False, "elapsed_ms": elapsed_ms,
                        "error": f"Direct HTTP returned {response.status_code}",
                        "_fallback": "direct_http"}
            finally:
                await direct_client.aclose()
        except asyncio.TimeoutError:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": "Direct HTTP timeout", "_fallback": "direct_http"}
        except Exception as e:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": f"Direct HTTP error: {str(e)[:150]}", "_fallback": "direct_http"}

    async def probe_url(self, url: str, identity: dict, timeout_s: float = 60.0) -> dict:
        if not self._client:
            raise RuntimeError("Client not initialized")
        start_ts = time.time()
        geo = identity.get("geo", "US")
        country = geo.split("-")[0].lower()
        proxy_type = identity.get("proxy_type", "residential")
        try:
            payload = {
                "zone": "mcp_unlocker",
                "url": url,
                "format": "raw",
                "country": country,
            }
            response = await asyncio.wait_for(
                self._client.post(
                    self.BRD_API,
                    json=payload,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                ),
                timeout=timeout_s,
            )
            elapsed_ms = int((time.time() - start_ts) * 1000)
            if response.status_code != 200:
                err_text = response.text[:200]
                # If BrightData zone doesn't exist, fall back to direct HTTP
                if "zone" in err_text.lower() and ("not found" in err_text.lower() or "does not exist" in err_text.lower()):
                    return await self._direct_http_fetch(url, identity, timeout_s)
                return {"success": False, "elapsed_ms": elapsed_ms,
                        "error": f"BrightData returned {response.status_code}: {err_text}"}
            page_text = response.text
            return {"success": True, "text": page_text, "elapsed_ms": elapsed_ms,
                    "_source": "brightdata"}
        except asyncio.TimeoutError:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": f"BrightData timeout {timeout_s}s"}
        except Exception as e:
            err_str = str(e)
            # Connection errors may indicate BD is down — try direct
            if "Connection" in err_str or "connect" in err_str.lower():
                return await self._direct_http_fetch(url, identity, timeout_s)
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": f"BrightData error: {err_str[:150]}"}

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
        discrimination_score=0.0, _created_at=time.time())
    SESSION_STORE[session_id] = session
    ACTIVE_SESSION_ID = session_id
    return session_id, session


MAX_SESSION_AGE_SECONDS = 1800
MAX_SESSION_ENTRIES = 100
CLEANUP_INTERVAL_SECONDS = 300


async def cleanup_expired_sessions():
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            now = time.time()
            expired = [
                sid for sid, s in SESSION_STORE.items()
                if now - s.get("_created_at", now) > MAX_SESSION_AGE_SECONDS
                and s.get("status") != "running"
            ]
            for sid in expired:
                SESSION_STORE.pop(sid, None)

            overflow = len(SESSION_STORE) - MAX_SESSION_ENTRIES
            if overflow > 0:
                sorted_ids = sorted(
                    SESSION_STORE.keys(),
                    key=lambda sid: SESSION_STORE[sid].get("_created_at", now),
                )
                for sid in sorted_ids[:overflow]:
                    if SESSION_STORE.get(sid, {}).get("status") != "running":
                        SESSION_STORE.pop(sid, None)
        except Exception:
            pass  # swallow to keep the background loop alive


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
        # Use effect size + delta percentage for significance with small samples
        # Cohen's d > 0.5 OR delta_pct > 5% = significant
        effect_size = abs(delta) / (math.sqrt((vh + vl) / 2) + 0.01) if (vh + vl) > 0 else 0.0
        significant = abs(t) > 1.5 or abs(dpct) > 5.0 or effect_size > 0.5
        labels_high = {"location": "High Income Area", "device": "Premium Device", "cookie_profile": "Aged Profile", "referrer": "Aggregator"}
        labels_low = {"location": "Low Income Area", "device": "Budget Device", "cookie_profile": "Fresh Profile", "referrer": "Direct"}
        results.append(dict(variable_name=var_name, state_high=labels_high.get(var_name, "High"),
            state_low=labels_low.get(var_name, "Low"), mean_price_high=round(mh, 2), mean_price_low=round(ml, 2),
            delta=round(delta, 2), delta_pct=round(dpct, 2), pooled_std=round(ps, 4),
            t_statistic=round(t, 4), significant=significant, n_high=nh, n_low=nl))
    for a in agents:
        if a.get("price") is None: continue
        p = a["price"]
        if abs(p - baseline) / baseline > 0.08 and baseline > 0:
            v = a.get("delta_variable")
            if v and not any(r["variable_name"] == v + "_outlier" for r in results):
                results.append(dict(
                    variable_name=v + "_outlier", state_high=str(a.get("delta_direction", "?")),
                    state_low="baseline", mean_price_high=round(p, 2),
                    mean_price_low=round(baseline, 2), delta=round(p - baseline, 2),
                    delta_pct=round((p - baseline) / baseline * 100, 2),
                    pooled_std=0.0, t_statistic=0.0, significant=True,
                    n_high=1, n_low=sum(1 for x in agents if x.get("price") == baseline)))
    return results


def classify_topology(gradients: List[dict], di: float, baseline: float) -> str:
    sig = sum(1 for g in gradients if g["significant"])
    di_pct = (di / baseline * 100) if baseline else 0
    max_dpct = max((abs(g.get("delta_pct", 0)) for g in gradients), default=0)
    if sig == 0 or max_dpct < 3: return "uniform"
    if sig <= 2 and max_dpct < 12: return "selective"
    if sig <= 3 and max_dpct < 25: return "progressive"
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


async def launch_single_agent(bd: BrightDataMCPClient, url: str, cfg: dict) -> dict:
    s = dict(agent_id=cfg["id"], label=cfg["label"], status="in_flight", price=None,
        response_time_ms=None, bot_detected=False, detection_signal=None, error_message=None,
        variables=cfg.get("variables", {}), delta_variable=cfg.get("delta_variable"),
        delta_direction=cfg.get("delta_direction"), is_control=cfg.get("is_control", False),
        network_tier=cfg.get("network_tier"), proxy_type=cfg.get("proxy_type"),
        retried=False)
    try:
        r = await bd.probe_url(url, cfg, 60.0)
        if not r["success"]:
            err = r.get("error", "Unknown")
            elapsed = r.get("elapsed_ms", 0)
            geo = cfg.get("geo", "")
            # Non-US agents that timed out get one retry with a datacenter proxy at 15s
            if "Timeout" in err and not geo.startswith("US"):
                retry_cfg = dict(cfg)
                retry_cfg["proxy_type"] = "datacenter"
                s["retried"] = True
                s["proxy_type"] = "datacenter"
                r = await bd.probe_url(url, retry_cfg, 15.0)
                if not r["success"]:
                    s["status"] = "failed"; s["error_message"] = err; s["response_time_ms"] = elapsed; return s
                # Retry succeeded — fall through to success handling below
            else:
                s["status"] = "failed"; s["error_message"] = err; s["response_time_ms"] = elapsed; return s
        s["response_time_ms"] = r.get("elapsed_ms", 0)
        detected, signal = check_bot_detection(r.get("text", ""))
        if detected:
            s["status"] = "detected"; s["bot_detected"] = True; s["detection_signal"] = signal; return s
        prices = parse_page_prices(r.get("text", ""), url)
        source_tag = r.get("_source", r.get("_fallback", "unknown"))
        if not prices:
            s["status"] = "failed"
            text_len = len(r.get("text", ""))
            if text_len < 200:
                s["error_message"] = f"No valid price found (page too small: {text_len}B, source={source_tag})"
            else:
                s["error_message"] = f"No valid price found in page ({text_len}B, source={source_tag})"
            return s
        s["price"] = prices[len(prices) // 2]; s["status"] = "success"; return s
    except Exception as e:
        s["status"] = "failed"; s["error_message"] = str(e); return s


async def run_full_probe(url: str, name: str, tier: str = "free") -> dict:
    sid, session = create_session(url, name)
    session["tier"] = tier
    overall_start = time.time()
    bd = BrightDataMCPClient()
    await bd.start()
    try:
        if tier == "pro":
            # Pro: single concurrent wave (no inter-wave stagger). Targets the
            # original PRD's <15s execution window. All 24 agents fire at once.
            all_configs = [c for wi in range(3) for c in WAVE_CONFIGS.get(wi, [])]
            tasks = [launch_single_agent(bd, url, c) for c in all_configs]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, Exception): session["failed_agents"] += 1; continue
                session["agents"].append(r)
                if r.get("price") is not None: session["all_prices"][r["agent_id"]] = r["price"]; session["successful_agents"] += 1
                elif r.get("bot_detected"): session["detected_agents"] += 1
                else: session["failed_agents"] += 1
        else:
            for wi in range(3):
                configs = WAVE_CONFIGS.get(wi, [])
                if not configs: continue
                tasks = [launch_single_agent(bd, url, c) for c in configs]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for r in results:
                    if isinstance(r, Exception): session["failed_agents"] += 1; continue
                    session["agents"].append(r)
                    if r.get("price") is not None: session["all_prices"][r["agent_id"]] = r["price"]; session["successful_agents"] += 1
                    elif r.get("bot_detected"): session["detected_agents"] += 1
                    else: session["failed_agents"] += 1
                if wi < 2: await asyncio.sleep(WAVE_STAGGER_S)
        all_prices = session.get("all_prices", {})
        valid = [p for p in all_prices.values() if p is not None]
        if session["detected_agents"] > 12:
            session["status"] = "completed"
            session["error"] = f"TARGET BLOCKED PROBE — {session['detected_agents']}/24 agents hit honeypot pages."
            session["elapsed_seconds"] = round(time.time() - overall_start, 2)
            await bd.close(); return session
        if check_zero_variance(all_prices):
            session["status"] = "completed"; session["baseline_price"] = statistics.median(valid) if valid else 0
            session["topology_class"] = "uniform"; session["discrimination_index"] = 0.0
            session["summary"] = "UNIFORM PRICING DETECTED — No discrimination across any variable."
            session["elapsed_seconds"] = round(time.time() - overall_start, 2)
            await bd.close(); return session
        if not valid:
            session["status"] = "failed"
            error_reasons: Dict[str, int] = {}
            for a in session["agents"]:
                err = a.get("error_message", "unknown")
                if err not in error_reasons:
                    error_reasons[err] = 0
                error_reasons[err] += 1
            best_reason = max(error_reasons, key=error_reasons.get) if error_reasons else "unknown"
            bd_fails = sum(1 for a in session["agents"] if "BrightData" in a.get("error_message", ""))
            zone_fails = sum(1 for a in session["agents"] if "zone" in a.get("error_message", "").lower())
            direct_fails = sum(1 for a in session["agents"] if "Direct HTTP" in a.get("error_message", ""))
            if zone_fails >= session["total_agents"] * 0.8:
                session["error"] = (
                    "BrightData zone 'mcp_unlocker' not found. "
                    "To fix: go to https://brightdata.com/cp/zones, "
                    "delete and recreate the 'mcp_unlocker' Web Unlocker zone, "
                    "then update BRIGHTDATA_UNLOCKER_ZONE in .env.local. "
                    "Meanwhile, demo mode is available for testing."
                )
            elif bd_fails >= session["total_agents"] * 0.5:
                session["error"] = f"BrightData API failures ({bd_fails}/{session['total_agents']} agents). Check your API key and zone."
            elif direct_fails >= session["total_agents"] * 0.5:
                session["error"] = f"Direct fetch failed ({direct_fails}/{session['total_agents']} agents). The target may require JavaScript rendering."
            else:
                session["error"] = f"No valid prices extracted ({session['failed_agents']} agents failed: {best_reason})"
            session["elapsed_seconds"] = round(time.time() - overall_start, 2)
            await bd.close(); return session
        bp = statistics.median(valid)
        session["baseline_price"] = round(bp, 2); session["mean_price"] = round(statistics.mean(valid), 2)
        session["price_range"] = [round(min(valid), 2), round(max(valid), 2)]
        session["max_price_spread"] = round(max(valid) - min(valid), 2)
        session["max_price_spread_pct"] = round((max(valid) - min(valid)) / bp * 100, 2) if bp else 0
        controls = [a["price"] for a in session["agents"] if a.get("is_control") and a.get("price") is not None]
        if len(controls) >= 2:
            cv = statistics.stdev(controls) / statistics.mean(controls)
            session["control_stability"] = round(1.0 - min(cv * 10, 1.0), 4)
        gradients = compute_gradients(session); session["gradients"] = gradients
        di = sum(abs(g["delta"]) for g in gradients if g["significant"])
        session["discrimination_index"] = round(di, 2)
        session["topology_class"] = classify_topology(gradients, di, bp)
        sig_vars = [g for g in gradients if g["significant"]]
        sig_details = "; ".join(f"{g['variable_name']}: ${g['delta']:+.2f}" for g in sig_vars)
        session["summary"] = (f"TOPOLOGY: {session['topology_class'].upper()}. "
            f"Baseline: ${bp:.2f}. Spread: ${session['max_price_spread']:.2f}. "
            f"DI: ${di:.2f}. Significant: {len(sig_vars)} vars. {sig_details}.")
        session["discrimination_score"] = compute_severity_score(session)
        max_a = max((a for a in session["agents"] if a.get("price")), key=lambda x: x["price"], default=None)
        min_a = min((a for a in session["agents"] if a.get("price")), key=lambda x: x["price"], default=None)
        session["max_discrimination_scenario"] = f"Max: {max_a['label']} @ ${max_a['price']:.2f}" if max_a else "N/A"
        session["min_discrimination_scenario"] = f"Min: {min_a['label']} @ ${min_a['price']:.2f}" if min_a else "N/A"
        session["status"] = "completed"; session["elapsed_seconds"] = round(time.time() - overall_start, 2)
    except Exception as e:
        session["status"] = "failed"; session["error"] = str(e); session["elapsed_seconds"] = round(time.time() - overall_start, 2)
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


# ─── In-Memory Rate Limiter ───────────────────────────────────────────────
# Limits POST /api/probe to _RATE_MAX requests per _RATE_WINDOW seconds per IP.
# Tracks timestamps per IP in a deque; evicts stale entries on each check.
# No external deps — runs in-process with uvicorn (single-worker async).

_RATE_MAX: int = 5
_RATE_WINDOW: float = 60.0

_rate_store: defaultdict[str, deque[float]] = defaultdict(deque)
_rate_lock = asyncio.Lock()


async def check_rate_limit(request: Request) -> None:
    """FastAPI dependency: enforce per-IP rate limit on /api/probe."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    async with _rate_lock:
        timestamps = _rate_store[ip]
        cutoff = now - _RATE_WINDOW
        while timestamps and timestamps[0] < cutoff:
            timestamps.popleft()

        if len(timestamps) >= _RATE_MAX:
            retry_after = int(timestamps[0] + _RATE_WINDOW - now) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)


app = FastAPI(title="JACOBI — Adversarial Pricing Topology Probe", version="1.0.0")


@app.on_event("startup")
async def startup():
    asyncio.create_task(cleanup_expired_sessions())


# CORS: allow Vercel frontend + local dev
VERCEL_FRONTEND = os.environ.get("VERCEL_FRONTEND_URL", "https://jacobi.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(export_router)
app.include_router(billing_router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
FRONTEND_INDEX = os.path.join(FRONTEND_DIR, "index.html") if os.path.isdir(FRONTEND_DIR) else None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "jacobi-backend", "brightdata_configured": bool(BRIGHTDATA_API_KEY)}


@app.post("/api/probe")
async def launch_probe(
    input: TargetProbeInput,
    _: None = Depends(check_rate_limit),
    user=Depends(get_optional_user),
):
    """Launch a pricing probe. Falls back to demo data if BrightData MCP fails.

    Tier gating:
      - Anonymous: allowed (frontend enforces a soft localStorage cap)
      - Free signed-in: capped at FREE_MONTHLY_PROBES per calendar month
      - Pro signed-in: unlimited, runs single-wave concurrent
    """
    if input.use_data_dir:
        return {"session_id": "demo_session_static", "status": "completed"}

    tier = "free"
    if user:
        allowed, info = await can_run_probe(user["id"])
        if not allowed:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "quota_exceeded",
                    "tier": info["tier"],
                    "used": info["used"],
                    "limit": info["limit"],
                    "message": f"You've used {info['used']}/{info['limit']} free probes this month. Upgrade to Pro for unlimited.",
                },
            )
        tier = info["tier"]

    try:
        session = await run_full_probe(input.target_url, input.target_name, tier=tier)
        # Persist to Supabase (and bump the user's monthly counter on success)
        try:
            await save_probe(session, user_id=user["id"] if user else None)
        except TypeError:
            # save_probe may not yet accept user_id on older deploys
            await save_probe(session)
        except Exception as db_err:
            print(f"[MAIN] Supabase save skipped: {db_err}")
        if user and session.get("status") == "completed" and tier != "pro":
            try:
                await increment_probe_count(user["id"])
            except Exception as e:
                print(f"[MAIN] increment skipped: {e}")
        # Persist to Cognee memory (fire-and-forget, no-op if not configured)
        try:
            await remember_probe(session)
        except Exception:
            pass
        return {"session_id": session["session_id"], "status": session["status"]}
    except Exception as e:
        # On MCP connection failure, return demo data with a warning
        err_msg = str(e)
        if "Connection closed" in err_msg or "MCP" in err_msg:
            return {
                "session_id": "demo_session_static",
                "status": "completed",
                "warning": "Live probe unavailable (MCP connection issue). Showing simulated results.",
            }
        raise HTTPException(status_code=500, detail=err_msg)


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
            proxy_type=a.get("proxy_type"), retried=a.get("retried", False),
        ))
    return agents


@app.get("/api/result/{session_id}")
async def get_result(session_id: str):
    if session_id == "demo_session_static":
        return DEMO_RESULT
    session = SESSION_STORE.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    agents = build_agent_list(session)
    return dict(
        session_id=session["session_id"], target_url=session["target_url"],
        target_name=session["target_name"], timestamp=session["timestamp"],
        status=session["status"], total_agents=session["total_agents"],
        successful_agents=session["successful_agents"], failed_agents=session["failed_agents"],
        detected_agents=session["detected_agents"], elapsed_seconds=session["elapsed_seconds"],
        control_stability=session["control_stability"], baseline_price=session["baseline_price"],
        mean_price=session["mean_price"], all_prices=session["all_prices"],
        price_range=session["price_range"], max_price_spread=session["max_price_spread"],
        max_price_spread_pct=session["max_price_spread_pct"], gradients=session["gradients"],
        discrimination_index=session["discrimination_index"], topology_class=session["topology_class"],
        summary=session["summary"],         max_discrimination_scenario=session["max_discrimination_scenario"],
        min_discrimination_scenario=session["min_discrimination_scenario"], agents=agents,
        discrimination_score=session.get("discrimination_score", 0),
        error=session.get("error"),
    )


@app.get("/api/share/{session_id}")
async def get_share_result(session_id: str):
    """Retrieve a probe result for sharing. Tries Supabase first, falls back to in-memory."""
    # Demo static
    if session_id == "demo_session_static":
        return DEMO_RESULT

    # Try Supabase
    try:
        from supabase_client import get_probe_by_session_id
        db_result = await get_probe_by_session_id(session_id)
        if db_result:
            return db_result
    except Exception as e:
        print(f"[SHARE] Supabase lookup failed: {e}")

    # Fallback to in-memory SESSION_STORE
    session = SESSION_STORE.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Share link expired or not found")
    agents = build_agent_list(session)
    return dict(
        session_id=session["session_id"], target_url=session["target_url"],
        target_name=session["target_name"], timestamp=session["timestamp"],
        status=session["status"], total_agents=session["total_agents"],
        successful_agents=session["successful_agents"], failed_agents=session["failed_agents"],
        detected_agents=session["detected_agents"], elapsed_seconds=session["elapsed_seconds"],
        control_stability=session["control_stability"], baseline_price=session["baseline_price"],
        mean_price=session["mean_price"], all_prices=session["all_prices"],
        price_range=session["price_range"], max_price_spread=session["max_price_spread"],
        max_price_spread_pct=session["max_price_spread_pct"], gradients=session["gradients"],
        discrimination_index=session["discrimination_index"], topology_class=session["topology_class"],
        summary=session["summary"],         max_discrimination_scenario=session["max_discrimination_scenario"],
        min_discrimination_scenario=session["min_discrimination_scenario"], agents=agents,
        discrimination_score=session.get("discrimination_score", 0),
        error=session.get("error"),
    )


@app.get("/api/demo")
async def get_demo_data():
    return DEMO_RESULT


@app.get("/api/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Return top N probes by savings (max_price_spread)."""
    try:
        from supabase_client import get_probe_history
        probes = await get_probe_history(limit=20)
        # Sort by max_price_spread descending, take top N
        sorted_probes = sorted(
            [p for p in probes if p.get("max_price_spread")],
            key=lambda p: p["max_price_spread"],
            reverse=True
        )[:limit]
        return [
            {
                "name": p.get("target_name", p.get("target_url", "Unknown"))[:30],
                "savings": p["max_price_spread"],
                "url": p.get("target_url", ""),
            }
            for p in sorted_probes
        ]
    except Exception as e:
        # Return empty leaderboard on any error (backend might not have Supabase configured)
        return []


@app.get("/api/history")
async def get_history(limit: int = 50):
    """Return recent probe sessions. Tries Supabase first, falls back to in-memory store."""
    sessions = []

    # First try Supabase
    try:
        from supabase_client import get_probe_history
        db_probes = await get_probe_history(limit=limit)
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

    # Fall back to in-memory store if Supabase returned nothing or failed
    if not sessions:
        for sid, session in SESSION_STORE.items():
            if session.get("status") in ("completed", "failed"):
                sessions.append({
                    "session_id": sid,
                    "target_url": session.get("target_url", ""),
                    "target_name": session.get("target_name", ""),
                    "timestamp": session.get("timestamp", ""),
                    "status": session.get("status"),
                    "baseline_price": session.get("baseline_price"),
                    "max_price_spread": session.get("max_price_spread"),
                    "topology_class": session.get("topology_class"),
                    "discrimination_score": session.get("discrimination_score"),
                    "elapsed_seconds": session.get("elapsed_seconds"),
                    "successful_agents": session.get("successful_agents"),
                    "total_agents": session.get("total_agents", 24),
                })
        sessions.sort(key=lambda s: str(s.get("timestamp", "")), reverse=True)

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
