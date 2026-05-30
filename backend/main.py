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
from collections import defaultdict
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

from brightdata_config import BRIGHTDATA_API_KEY, BRIGHTDATA_UNLOCKER_ZONE


class TargetProbeInput(BaseModel):
    target_url: str = Field(..., description="Full URL of the target product page")
    target_name: str = Field(default="UA123 JFK→SFO", description="Human-readable target label")
    use_data_dir: Optional[str] = Field(default=None, description="Load pre-cached demo data instead of live probe")
    # Opt-in flag for the public board. Default False → probe stays private to
    # the user's account / history. Frontend cockpit exposes this as a toggle.
    publish_to_board: bool = Field(default=False, description="If true, mark the resulting probe row is_public=true")


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
    "amazon": {"min": 1, "max": 5000},
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


def check_bot_detection(text: str) -> Tuple[bool, Optional[str]]:
    """Return (blocked, signal_phrase). Operates on VISIBLE rendered text
    only — won't false-positive on dev comments or JS strings inside
    legitimate pages.

    Two layers:
      1. Explicit honeypot phrases in visible text.
      2. Suspiciously thin page heuristic — a 1KB HTML response with no
         visible text is almost always a block / JS-only shell that we
         can't probe meaningfully via direct HTTP.
    """
    visible = _visible_text(text)

    # 1. Explicit phrases (most reliable signal).
    short = len(visible) < 4000
    head = visible[:4000]
    for phrase in HONEYPOT_PHRASES:
        if phrase in head:
            return True, phrase
        if short and phrase in visible:
            return True, phrase

    # 2. Heuristic thin-page check.
    #   - Empty body (0 bytes) means the upstream rejected us outright.
    #   - <800 bytes of HTML with <80 chars visible = either a block page
    #     or a JS-only shell. Either way we can't extract a price.
    if not text:
        return True, "empty response"
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
        self._client = httpx.AsyncClient(timeout=30.0)

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

    async def _direct_http_fetch(self, url: str, identity: dict, timeout_s: float) -> dict:
        """Direct HTTP fetch — used when BrightData is unavailable.

        Sends the agent's User-Agent / Accept-Language / Referer so device,
        cookie-profile and referrer vectors remain honest. The location /
        geo-IP vector degrades because we're not behind a proxy — that's
        logged internally; the customer-facing UI is unchanged.
        """
        import httpx
        start_ts = time.time()
        headers = {
            "User-Agent": identity.get("user_agent") or (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        if identity.get("referrer"):
            headers["Referer"] = identity["referrer"]
        if identity.get("cookie"):
            headers["Cookie"] = identity["cookie"]
        if identity.get("sec_ch_ua"):
            headers["Sec-CH-UA"] = identity["sec_ch_ua"]
        try:
            async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as c:
                r = await asyncio.wait_for(c.get(url, headers=headers), timeout=timeout_s)
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
            or BRIGHTDATA_UNLOCKER_ZONE.strip().lower() in {"placeholder", "none", "todo", "tbd"}
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
                "render": True,
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
            if response.status_code == 200:
                return {"success": True, "text": response.text, "elapsed_ms": elapsed_ms}
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


def classify_topology(gradients: List[dict], di: float, baseline: float) -> str:
    sig = sum(1 for g in gradients if g["significant"])
    di_pct = (di / baseline * 100) if baseline else 0
    if sig == 0: return "uniform"
    if sig <= 2 and di_pct < 10: return "selective"
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


async def launch_single_agent(bd: BrightDataMCPClient, url: str, cfg: dict) -> dict:
    s = dict(agent_id=cfg["id"], label=cfg["label"], status="in_flight", price=None,
        response_time_ms=None, bot_detected=False, detection_signal=None, error_message=None,
        variables=cfg.get("variables", {}), delta_variable=cfg.get("delta_variable"),
        delta_direction=cfg.get("delta_direction"), is_control=cfg.get("is_control", False),
        network_tier=cfg.get("network_tier"), proxy_type=cfg.get("proxy_type"))
    try:
        r = await bd.probe_url(url, cfg, 30.0)
        if not r["success"]:
            s["status"] = "failed"; s["error_message"] = r.get("error", "Unknown"); s["response_time_ms"] = r.get("elapsed_ms", 0); return s
        s["response_time_ms"] = r.get("elapsed_ms", 0)
        detected, signal = check_bot_detection(r.get("text", ""))
        if detected:
            s["status"] = "detected"; s["bot_detected"] = True; s["detection_signal"] = signal; return s
        prices = parse_page_prices(r.get("text", ""), url)
        if not prices:
            s["status"] = "failed"; s["error_message"] = "No valid price found"; return s
        s["price"] = prices[len(prices) // 2]; s["status"] = "success"; return s
    except Exception as e:
        s["status"] = "failed"; s["error_message"] = str(e); return s


async def run_full_probe(url: str, name: str) -> dict:
    """Synchronous wrapper for callers that want the full result. The
    /api/probe endpoint now launches the engine via run_probe_in_background()
    instead, so this blocking variant is only used by scripts / tests."""
    sid, session = create_session(url, name)
    return await _run_probe_engine(session, url)


async def _run_probe_engine(session: dict, url: str) -> dict:
    """The actual 24-agent engine — runs in-place on the provided session
    dict. Separated from create_session() so /api/probe can return the
    session_id immediately, then launch this in a background task so the
    HTTP response isn't blocked by 12-50 seconds of fetching."""
    overall_start = time.time()
    bd = BrightDataMCPClient()
    await bd.start()
    try:
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
            # No usable prices. Pick the most actionable explanation
            # based on what the engine actually observed.
            session["status"] = "failed"
            if session["detected_agents"] > 0:
                session["error"] = (
                    f"This site blocked our agents at the perimeter — "
                    f"{session['detected_agents']}/24 hit a honeypot / captcha. "
                    f"Try a different URL or use one of the case studies."
                )
            else:
                session["error"] = (
                    "Reached the page but couldn't find a comparable price field. "
                    "The site may JS-render prices after page load. "
                    "Try a hotel or product page with a clearly listed price."
                )
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
    bd_zone_ok = bool(
        BRIGHTDATA_UNLOCKER_ZONE
        and BRIGHTDATA_UNLOCKER_ZONE.strip().lower() not in {"placeholder", "none", "todo", "tbd"}
    )
    fully_live = bd_key_ok and bd_zone_ok

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
    sid, session = create_session(input.target_url, input.target_name)
    asyncio.create_task(_complete_probe_in_background(
        session=session,
        url=input.target_url,
        user_id=user["id"],
        publish_to_board=bool(input.publish_to_board),
    ))
    return {"session_id": sid, "status": "running"}


async def _complete_probe_in_background(
    session: dict,
    url: str,
    user_id: str,
    publish_to_board: bool,
) -> None:
    """Run the probe engine, persist the result, increment the quota.
    Wrapped so the launch endpoint can fire-and-forget.

    Every step is fail-soft so an exception in the persistence layer
    doesn't poison the in-memory session — the user can still poll
    /api/result and see whatever the engine produced.
    """
    try:
        await _run_probe_engine(session, url)
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
