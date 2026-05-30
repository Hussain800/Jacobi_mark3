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


def parse_page_prices(html: str, url: str) -> List[float]:
    results: List[float] = []
    url_lower = url.lower()
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

    # Try parsing with BeautifulSoup
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")

        def parse_price_text(el) -> Optional[str]:
            if not el: return None
            t = el.get_text(strip=True)
            return t if t else None

        # JSON-LD structured data
        for script in soup.select('script[type="application/ld+json"]'):
            try:
                data = json.loads(script.string)
                items = []
                if isinstance(data, dict):
                    items.append(data)
                    if "offers" in data:
                        items.append(data["offers"])
                    if "itemListElement" in data:
                        items.extend(data["itemListElement"])
                elif isinstance(data, list):
                    items.extend(data)
                for item in items:
                    if not isinstance(item, dict): continue
                    for key in ["price", "lowPrice", "highPrice", "priceSpecification"]:
                        val = item.get(key, item if key == "priceSpecification" else None)
                        if isinstance(val, dict):
                            p = _parse_number(str(val.get("price", "0")))
                            if p and p > 5:
                                store(p, str(val.get("priceCurrency", currency_code)))
                        elif val is not None:
                            p = _parse_number(str(val))
                            if p and p > 5:
                                store(p, str(item.get("priceCurrency", currency_code)))
            except Exception:
                pass

        # Domain-specific CSS selectors
        if "booking.com" in url_lower:
            for sel in [
                '[data-testid="price-and-discounted-price"]',
                '[data-testid="price-for-x-nights"]',
                '[data-testid*="rate"]',
                '[data-testid*="room"]',
                '[data-testid*="price"]',
                'div[data-testid="hprt-table"]',
                '[class*="bui-price"]',
                '[data-price-currency]',
                '[class*="prco-"]',
                '[class*="-price-"]',
                '[itemprop="price"]',
                '.bui-price-display__value',
                '.sr_gs_price',
                '.avble',
                '.hotel_price',
                '.price_link',
                'span[class*="price"]',
                'div[class*="price"]',
            ]:
                for el in soup.select(sel):
                    t = parse_price_text(el)
                    if t and len(t) < 100:
                        n = _parse_number(t)
                        if n and pr["min"] <= n <= pr["max"] * 2:
                            detected = currency_code
                            for sym, c in CURRENCY_SYMBOL_MAP.items():
                                if sym in t: detected = c; break
                            store(n, detected)

        elif "amazon" in url_lower:
            for sel in ['span.a-price span.a-offscreen', 'span.a-price-whole', '.a-price .a-offscreen', '.a-color-base']:
                for el in soup.select(sel):
                    t = parse_price_text(el)
                    if t:
                        n = _parse_number(t)
                        if n: store(n, "USD")

        elif any(a in url_lower for a in ["flydubai", "united", "delta", "emirates", "expedia"]):
            for sel in ['[class*="fare"]', '[class*="price"]', '[data-testid*="price"]', '.total-amount', '.amount']:
                for el in soup.select(sel):
                    t = parse_price_text(el)
                    if t:
                        n = _parse_number(t)
                        if n and n > 10: store(n, currency_code)

        else:
            for sel in [
                '[data-price]', '[itemprop="price"]', '.price', '.amount',
                '.product-price', '.sale-price', '[class*="price"]',
                '[data-testid*="price"]', '.total', '[class*="ProductPrice"]',
                '[class*="product-price"]', '[class*="sale-price"]',
            ]:
                for el in soup.select(sel):
                    t = parse_price_text(el)
                    if t and len(t) < 60:
                        n = _parse_number(t)
                        if n and n > 5: store(n, currency_code)
    except Exception:
        pass

    # Deduplicate
    results = sorted(set(round(p, 2) for p in results))

    # Trim outliers if enough results
    if len(results) >= 6:
        cut = max(1, len(results) // 10)
        results = results[cut:-cut]

    # Aggressive regex fallback when BS finds too few
    if len(results) < 2:
        visible = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        visible = re.sub(r'<style[^>]*>.*?</style>', '', visible, flags=re.DOTALL | re.IGNORECASE)

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

        for pat, conv_rate, min_val, max_val in currency_patterns:
            for m in re.finditer(pat, visible):
                try:
                    v = float(m.group(1).replace(",", ""))
                    usd = v * conv_rate
                    if min_val <= v <= max_val and pr["min"] <= usd <= pr["max"]:
                        results.append(round(usd, 2))
                except ValueError:
                    continue

        # Last resort: find any reasonable number near currency context
        if len(results) < 2:
            for m in re.finditer(r'(?:price|total|fare|amount|cost|rate|night|room|person)\s*:?\s*\$?\s*(\d{2,5}(?:\.\d{2})?)', visible, re.IGNORECASE):
                try:
                    v = float(m.group(1).replace(",", ""))
                    if pr["min"] <= v <= pr["max"]:
                        results.append(round(v, 2))
                except ValueError:
                    continue

        # If nothing found at all, try parsing numbers from any visible text as last resort
        if len(results) < 1:
            currency_code_names = "|".join(CURRENCY_RATES.keys())
            for m in re.finditer(rf'(?:{currency_code_names})\s*(\d{{2,6}}(?:\.\d{{2}})?)', visible, re.IGNORECASE):
                try:
                    code = m.group(0).split()[0]
                    v = float(m.group(1).replace(",", ""))
                    rate_c = CURRENCY_RATES.get(code.upper(), 1.0)
                    usd = v * rate_c
                    if pr["min"] <= usd <= pr["max"]:
                        results.append(round(usd, 2))
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
        self._client = httpx.AsyncClient(timeout=30.0)

    async def probe_url(self, url: str, identity: dict, timeout_s: float = 30.0) -> dict:
        if not self._client:
            raise RuntimeError("Client not initialized")
        start_ts = time.time()
        geo = identity.get("geo", "US")
        country = geo.split("-")[0].lower()
        proxy_type = identity.get("proxy_type", "residential")
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
            if response.status_code != 200:
                return {"success": False, "elapsed_ms": elapsed_ms,
                        "error": f"API returned {response.status_code}: {response.text[:200]}"}
            page_text = response.text
            return {"success": True, "text": page_text, "elapsed_ms": elapsed_ms}
        except asyncio.TimeoutError:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": f"Timeout {timeout_s}s"}
        except Exception as e:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000),
                    "error": str(e)}

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
    sid, session = create_session(url, name)
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
            session["status"] = "failed"; session["error"] = "No valid prices extracted."
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
    return {"status": "healthy", "service": "jacobi-backend", "brightdata_configured": bool(BRIGHTDATA_API_KEY)}


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

    try:
        session = await run_full_probe(input.target_url, input.target_name)
        # Persist to Supabase, stamping the owning user so RLS + history work.
        saved_id = None
        try:
            saved_id = await save_probe(
                session,
                user_id=user["id"],
                is_public=bool(input.publish_to_board),
            )
        except Exception as db_err:
            print(f"[MAIN] Supabase save skipped: {db_err}")
        # Increment quota ONLY when a row was actually persisted. This stops
        # transient DB errors from charging credit, and stops the static-demo
        # path from ever counting.
        if saved_id:
            try:
                await increment_probe_count(user["id"])
            except Exception as inc_err:
                print(f"[PROBE] increment_probe_count failed: {inc_err!r}")
        return {"session_id": session["session_id"], "status": session["status"]}
    except Exception as e:
        err_msg = str(e)
        if "Connection closed" in err_msg or "MCP" in err_msg:
            # Engine couldn't start → don't consume credit, surface as static
            # demo so the user still sees *something*.
            return {
                "session_id": "demo_session_static",
                "status": "completed",
                "warning": "Live probe unavailable. Showing reference data.",
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
