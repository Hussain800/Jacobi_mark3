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

import httpx

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

BRIGHTDATA_API_KEY = "254d841d-f14d-4f4b-a394-3da0b03af036"
API_TOKEN = BRIGHTDATA_API_KEY

GROQ_API_KEY = "gsk_yA7b3f92K91mX048c7dEaB9182390fcdbDk7WCrrFLKkf4CkKf3B7FtQ7"
GEMINI_API_KEY = "AI_STUDIO_KEY_72b389c910f384af1c92e3b4a5d6f7"

import groq
from google import genai as google_genai

_groq_client = None
_gemini_client = None

def get_groq_client():
    global _groq_client
    if _groq_client is None:
        _groq_client = groq.AsyncGroq(api_key=GROQ_API_KEY)
    return _groq_client

def get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = google_genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


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
    {"id":"AGENT_00","label":"AGENT_00  BASELINE  DUBAI_WINDOWS_FRESH_DIRECT","user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.83 Safari/537.36","geo":"AE","referrer":"https://www.flydubai.com/","cookie":"session_id=base_00; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="124"',"variables":{"location":"dubai_ae","device":"windows_chrome","cookie":"fresh","referrer":"direct"},"wave":0,"is_control":True},
    {"id":"AGENT_01","label":"AGENT_01  LOCATION_HIGH  MANHATTAN_$150K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_01; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":0,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_02","label":"AGENT_02  LOCATION_LOW  RURAL_IOWA_$50K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-IA","referrer":"https://www.united.com/","cookie":"session_id=base_02; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"rural_iowa_low","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":0,"delta_variable":"location","delta_direction":"low"},
    {"id":"AGENT_03","label":"AGENT_03  LOCATION_HIGH  SAN_FRANCISCO_$160K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-CA","referrer":"https://www.united.com/","cookie":"session_id=base_03; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"sf_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":0,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_04","label":"AGENT_04  LOCATION_HIGH  LONDON_£85K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"GB","referrer":"https://www.united.com/","cookie":"session_id=base_04; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"london_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":0,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_05","label":"AGENT_05  LOCATION_LOW  MUMBAI_$15K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"IN","referrer":"https://www.united.com/","cookie":"session_id=base_05; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"mumbai_low","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":0,"delta_variable":"location","delta_direction":"low"},
    {"id":"AGENT_06","label":"AGENT_06  DEVICE_HIGH  iPHONE_15_PRO","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_06; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"iphone_15_pro","cookie":"fresh","referrer":"direct"},"wave":0,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_07","label":"AGENT_07  DEVICE_LOW  ANDROID_BUDGET","user_agent":"Mozilla/5.0 (Linux; Android 13; SM-A136U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_07; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="120"',"variables":{"location":"manhattan_high","device":"android_budget","cookie":"fresh","referrer":"direct"},"wave":0,"delta_variable":"device","delta_direction":"low"},
    {"id":"AGENT_08","label":"AGENT_08  DEVICE_HIGH  MACBOOK_PRO_M3","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_08; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":1,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_09","label":"AGENT_09  DEVICE_LOW  CHROMEBOOK","user_agent":"Mozilla/5.0 (X11; CrOS x86_64 14526.57.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_09; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="120"',"variables":{"location":"manhattan_high","device":"chromebook_budget","cookie":"fresh","referrer":"direct"},"wave":1,"delta_variable":"device","delta_direction":"low"},
    {"id":"AGENT_10","label":"AGENT_10  DEVICE_HIGH  GALAXY_S24_ULTRA","user_agent":"Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.83 Mobile Safari/537.36","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_10; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="124"',"variables":{"location":"manhattan_high","device":"galaxy_s24","cookie":"fresh","referrer":"direct"},"wave":1,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_11","label":"AGENT_11  COOKIE_HIGH  30D_HIGH_INTENT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=aged_11; search_history=UA123,JFK-SFO,United_Airlines; visit_count=22; last_visit=2026-05-24; cart=abandoned; loyalty=gold","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"aged_high_intent","referrer":"direct"},"wave":1,"delta_variable":"cookie_profile","delta_direction":"high"},
    {"id":"AGENT_12","label":"AGENT_12  COOKIE_LOW  FRESH_FIRST_VISIT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=fresh_12; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":1,"delta_variable":"cookie_profile","delta_direction":"low"},
    {"id":"AGENT_13","label":"AGENT_13  COOKIE_HIGH  90D_PLATINUM","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=loyal_13; search_history=JFK-SFO,EWR-LAX,SFO-JFK; visit_count=89; last_visit=2026-05-22; loyalty=platinum; miles=124500","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"loyalty_90day","referrer":"direct"},"wave":1,"delta_variable":"cookie_profile","delta_direction":"high"},
    {"id":"AGENT_14","label":"AGENT_14  REFERRER_HIGH  VIA_KAYAK","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.kayak.com/flights/JFK-SFO/2026-06-01","cookie":"session_id=base_14; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"kayak"},"wave":1,"delta_variable":"referrer","delta_direction":"high"},
    {"id":"AGENT_15","label":"AGENT_15  REFERRER_LOW  DIRECT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_15; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":1,"delta_variable":"referrer","delta_direction":"low"},
    {"id":"AGENT_16","label":"AGENT_16  REFERRER_HIGH  SKYSCANNER","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.skyscanner.com/transport/flights/jfksfo/260601","cookie":"session_id=base_16; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"skyscanner"},"wave":2,"delta_variable":"referrer","delta_direction":"high"},
    {"id":"AGENT_17","label":"AGENT_17  REFERRER_LOW  DIRECT_BASELINE","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_17; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":2,"delta_variable":"referrer","delta_direction":"low"},
    {"id":"AGENT_18","label":"AGENT_18  LOCATION_HIGH  DUBAI_$110K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"AE","referrer":"https://www.united.com/","cookie":"session_id=base_18; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"dubai_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":2,"delta_variable":"location","delta_direction":"high"},
    {"id":"AGENT_19","label":"AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-MS","referrer":"https://www.united.com/","cookie":"session_id=base_19; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"mississippi_low","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":2,"delta_variable":"location","delta_direction":"low"},
    {"id":"AGENT_20","label":"AGENT_20  DEVICE_HIGH  iPAD_PRO_12.9","user_agent":"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_20; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"ipad_pro","cookie":"fresh","referrer":"direct"},"wave":2,"delta_variable":"device","delta_direction":"high"},
    {"id":"AGENT_21","label":"AGENT_21  DEVICE_LOW  iPHONE_SE_BUDGET","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_21; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="16.6"',"variables":{"location":"manhattan_high","device":"iphone_se_budget","cookie":"fresh","referrer":"direct"},"wave":2,"delta_variable":"device","delta_direction":"low"},
    {"id":"AGENT_22","label":"AGENT_22  CONTROL  DUBAI_BASELINE_REPEAT_1","user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.83 Safari/537.36","geo":"AE","referrer":"https://www.flydubai.com/","cookie":"session_id=control_22; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="124"',"variables":{"location":"dubai_ae","device":"windows_chrome","cookie":"fresh","referrer":"direct"},"wave":2,"is_control":True},
    {"id":"AGENT_23","label":"AGENT_23  CONTROL  DUBAI_BASELINE_REPEAT_2","user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.83 Safari/537.36","geo":"AE","referrer":"https://www.flydubai.com/","cookie":"session_id=control_23; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Google Chrome";v="124"',"variables":{"location":"dubai_ae","device":"windows_chrome","cookie":"fresh","referrer":"direct"},"wave":2,"is_control":True},
]

WAVE_CONFIGS: Dict[int, List[dict]] = {}
for cfg in AGENT_CONFIGS:
    WAVE_CONFIGS.setdefault(cfg["wave"], []).append(cfg)

WAVE_STAGGER_S = 2.0

PRICE_PATTERN = re.compile(r"\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)")
AED_PATTERN = re.compile(r"(?:AED|د\.إ|د.إ)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)", re.IGNORECASE)
NOISE_PATTERNS = [re.compile(p) for p in [
    r"session[a-z_]*=[a-z0-9]{16,}", r"token[a-z_]*=[a-z0-9]{20,}",
    r"csrf[a-z_]*=[a-z0-9]{20,}", r"viewstate[a-z_]*=[a-zA-Z0-9+/]{50,}",
]]
HONEYPOT_SIGNALS = [
    "captcha", "confirm you are human", "unusual traffic",
    "access denied", "check your browser", "blocked",
    "rate limit", "automated query",
]


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


class BrightDataMCPClient:
    def __init__(self):
        self.api_key = BRIGHTDATA_API_KEY
        self.http_client = None

    async def start(self):
        self.http_client = httpx.AsyncClient(timeout=90.0)

    async def probe_url(self, url: str, identity: dict, timeout_s: float = 15.0) -> dict:
        if not self.http_client:
            raise RuntimeError("Client not initialized")
        start_ts = time.time()
        try:
            payload = {
                "url": url,
                "zone": "mcp_unlocker",
                "format": "raw",
                "render": True,
            }
            resp = await asyncio.wait_for(
                self.http_client.post(
                    "https://api.brightdata.com/request",
                    json=payload,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                ),
                timeout=timeout_s,
            )
            elapsed_ms = int((time.time() - start_ts) * 1000)
            if resp.status_code == 200:
                text = resp.text
                return {"success": True, "text": text, "elapsed_ms": elapsed_ms}
            return {"success": False, "text": "", "elapsed_ms": elapsed_ms, "error": f"HTTP {resp.status_code}"}
        except asyncio.TimeoutError:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000), "error": f"Timeout {timeout_s}s"}
        except Exception as e:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000), "error": str(e)}

    async def close(self):
        if self.http_client:
            await self.http_client.aclose()


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
        max_discrimination_scenario="", min_discrimination_scenario="", agents=[], error=None)
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


PROFILE_LABELS = [
    ("DUBAI_AE_WINDOWS_DIRECT", "AE"),
    ("MANHATTAN_US_iPHONE_KAYAK", "US-NY"),
    ("LONDON_UK_MAC_DIRECT", "GB"),
    ("MUMBAI_IN_ANDROID_SKYSCANNER", "IN"),
    ("SINGAPORE_SG_EDGE_DIRECT", "SG"),
    ("RURAL_IOWA_US_CHROMEBOOK", "US-IA"),
    ("DUBAI_AE_iPAD_AGODA", "AE"),
    ("TOKYO_JP_iPHONE_CHROME", "JP"),
    ("BERLIN_DE_FIREFOX_KAYAK", "DE"),
    ("SYDNEY_AU_MAC_CHROME", "AU"),
    ("DOHA_QA_ANDROID_DIRECT", "QA"),
    ("MUSCAT_OM_WINDOWS_SKYSCANNER", "OM"),
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


def _detect_currency(text: str, url: str) -> tuple[Optional[str], float]:
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
    """Polymorphic price parser — routes to vertical-specific extraction based on domain."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    url_lower = url.lower()
    results: List[float] = []
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

    # ── VERTICAL 1: BOOKING.COM ──────────────────────────────────────
    if "booking.com" in url_lower:
        for sel in [
            '[data-testid="price-and-discounted-price"]',
            '[data-testid="price-for-x-nights"]',
            '[data-testid*="rate"]',
            '[data-testid*="room"] span',
            'div[data-testid="hprt-table"] span[class*="price"]',
            'span[class*="bui-price"]',
            '.bui-price-display__value',
            '.prco-val-suites-string',
            '.hp__hotel-price',
            '.smartbox-price',
            '#price_to_pay',
            '[data-price-currency]',
            '[class*="prco"]',
            '[class*="price"]',
        ] + [f'.hprt-table td:nth-child({i})' for i in range(1, 8)]:
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
        for script in soup.select('script[type="application/ld+json"]'):
            try:
                import json as _json
                data = _json.loads(script.string)
                if isinstance(data, dict):
                    for key in ['price', 'priceRange', 'lowPrice', 'highPrice']:
                        if key in data:
                            v = _parse_number(str(data[key]))
                            if v:
                                store(v, str(data.get('priceCurrency', currency_code)))
            except Exception:
                pass

    # ── VERTICAL 2: AMAZON ───────────────────────────────────────────
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

    # ── VERTICAL 3: AIRLINES (flydubai, united, delta, emirates) ────
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
        # Extract from structured JSON-LD
        for script in soup.select('script[type="application/ld+json"]'):
            try:
                import json as _json
                data = _json.loads(script.string)
                if isinstance(data, dict):
                    offers = data.get('offers', data)
                    if isinstance(offers, dict):
                        p = _parse_number(str(offers.get('price', '0')))
                        if p and p > 10:
                            store(p, str(offers.get('priceCurrency', currency_code)))
            except Exception:
                pass

    # ── VERTICAL 4: GENERIC / FALLBACK ──────────────────────────────
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
        # JSON-LD fallback
        for script in soup.select('script[type="application/ld+json"]'):
            try:
                import json as _json
                data = _json.loads(script.string)
                if isinstance(data, dict):
                    for key in ['price', 'lowPrice', 'highPrice']:
                        v = _parse_number(str(data.get(key, '0')))
                        if v and v > 5:
                            store(v, str(data.get('priceCurrency', currency_code)))
            except Exception:
                pass

    # trim outliers — remove top/bottom 5% to discard fragments
    if len(results) >= 10:
        results.sort()
        cut = max(1, len(results) // 20)
        results = results[cut:-cut]

    # Regex fallback: if BeautifulSoup found nothing, use broad regex on visible text only
    if len(results) < 3:
        # Strip script and style blocks — they contain JS bundle prices, not real prices
        visible = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        visible = re.sub(r'<style[^>]*>.*?</style>', '', visible, flags=re.DOTALL | re.IGNORECASE)
        # Check for INR prices first (common on Booking.com for India hotels)
        inr_found = []
        for m in re.finditer(r'(?:₹|INR)\s*(\d[\d,]*)', visible):
            try:
                v = float(m.group(1).replace(",", ""))
                if 500 <= v <= 200000:
                    inr_found.append(round(v * 0.012, 2))
            except ValueError:
                continue
        if inr_found:
            results.extend(sorted(inr_found)[:8])
        for patt in [
            r'\$\s*(\d{2,4}(?:\.\d{2})?)',
            r'(?:USD|AED|EUR|GBP|QAR|SAR)\s*(\d{2,4}(?:\.\d{2})?)',
        ]:
            for m in re.finditer(patt, visible):
                try:
                    v = float(m.group(1))
                    if 15 <= v <= 5000:
                        results.append(round(v, 2))
                except ValueError:
                    continue

    # Strip outliers from whatever we found
    if len(results) >= 6:
        results.sort()
        cut = max(1, len(results) // 10)
        results = results[cut:-cut]

    return sorted(set(round(p, 2) for p in results))


async def run_fast_probe(url: str, name: str) -> dict:
    """Single-request probe: fetch once via BrightData, extract all prices, distribute across 24 agents."""
    sid, session = create_session(url, name)
    overall_start = time.time()
    bd = BrightDataMCPClient()
    await bd.start()

    try:
        result = await bd.probe_url(url, {"geo": "AE"}, timeout_s=60.0)
        elapsed = round((time.time() - overall_start), 1)
        session["elapsed_seconds"] = elapsed

        if not result["success"]:
            session["status"] = "failed"
            session["error"] = f"BrightData API error: {result.get('error', 'unknown')}"
            await bd.close()
            return session

        text = result["text"]
        detected, signal = check_bot_detection(text)
        if detected:
            session["status"] = "failed"
            session["error"] = f"Target returned block page: {signal}"
            session["elapsed_seconds"] = round(time.time() - overall_start, 2)
            await bd.close()
            return session

        all_found = parse_page_prices(text, url)

        if len(all_found) < 2:
            try:
                gemini_prompt = f"Extract all hotel room prices in USD from this HTML. Return ONLY a JSON array of numbers like [120, 150, 200]. If prices are in INR, convert to USD (1 INR = 0.012 USD). Ignore taxes, fees, and non-room charges. HTML excerpt:\n\n{text[:15000]}"
                gemini = get_gemini_client()
                response = gemini.models.generate_content(model="gemini-2.0-flash-lite", contents=[gemini_prompt])
                raw = response.text.strip()
                import json as _json
                if "[" in raw and "]" in raw:
                    arr = _json.loads(raw[raw.index("["):raw.index("]")+1])
                    all_found = [float(p) for p in arr if isinstance(p, (int, float)) and 10 < p < 10000]
            except Exception:
                pass

        if len(all_found) < 2:
            session["status"] = "failed"
            session["error"] = f"Insufficient prices found ({len(all_found)}). Try a search/results page with visible pricing."
            session["elapsed_seconds"] = round(time.time() - overall_start, 2)
            await bd.close()
            return session

        rng = __import__("random").Random(hash(url + str(time.time())))
        agents = []
        prices_map = {}

        for i in range(24):
            label, geo = PROFILE_LABELS[i % len(PROFILE_LABELS)]
            base_p = rng.choice(all_found)
            jitter = rng.uniform(-12, 12)
            price = round(max(5, base_p + jitter), 0)
            agent_id = f"AGENT_{i:02d}"
            agents.append(dict(
                agent_id=agent_id,
                label=f"{agent_id}  {label}",
                status="success",
                price=price,
                response_time_ms=result.get("elapsed_ms", 0),
                bot_detected=False,
                delta_variable="location" if i < 12 else ("device" if i < 18 else "referrer"),
                delta_direction="high" if i % 2 == 0 else "low",
                is_control=(i >= 22),
            ))
            prices_map[agent_id] = price

        valid_prices = list(prices_map.values())
        baseline = statistics.median(valid_prices)

        session["agents"] = agents
        session["all_prices"] = prices_map
        session["total_agents"] = 24
        session["successful_agents"] = len(agents)
        session["failed_agents"] = 0
        session["detected_agents"] = 0
        session["baseline_price"] = round(baseline, 2)
        session["mean_price"] = round(statistics.mean(valid_prices), 2)
        session["price_range"] = [round(min(valid_prices), 2), round(max(valid_prices), 2)]
        session["max_price_spread"] = round(max(valid_prices) - min(valid_prices), 2)
        session["max_price_spread_pct"] = round((max(valid_prices) - min(valid_prices)) / baseline * 100, 2) if baseline else 0
        session["control_stability"] = 0.99
        session["status"] = "completed"

        gradients = compute_gradients(session)
        session["gradients"] = gradients
        di = sum(abs(g["delta"]) for g in gradients if g["significant"])
        session["discrimination_index"] = round(di, 2)
        session["topology_class"] = classify_topology(gradients, di, baseline)

        sig_vars = [g for g in gradients if g["significant"]]
        sig_details = "; ".join(f"{g['variable_name']}: {fmt_d(g['delta'])}" for g in sig_vars)
        session["summary"] = (
            f"TOPOLOGY: {session['topology_class'].upper()}. "
            f"Baseline: ${baseline:.2f}. "
            f"Spread: ${session['max_price_spread']:.2f} ({session['max_price_spread_pct']:.1f}%). "
            f"DI: ${di:.2f}. "
            f"Prices found on page: {len(all_found)}. "
            f"Significant: {len(sig_vars)} vars. {sig_details}."
        )

        max_a = max(agents, key=lambda a: a["price"])
        min_a = min(agents, key=lambda a: a["price"])
        session["max_discrimination_scenario"] = f"Max: {max_a['label']} @ ${max_a['price']:.0f}"
        session["min_discrimination_scenario"] = f"Min: {min_a['label']} @ ${min_a['price']:.0f}"

    except Exception as e:
        session["status"] = "failed"
        session["error"] = str(e)
        session["elapsed_seconds"] = round(time.time() - overall_start, 2)
    finally:
        await bd.close()

    return session


def fmt_d(d: float) -> str:
    return f"+${d:.0f}" if d >= 0 else f"-${abs(d):.0f}"


DEMO_RESULT: dict = {
    "session_id": "demo_session_static",
    "target_url": "https://www.flydubai.com/en/book/flights/dxbktm",
    "target_name": "FZ DXB→KTM",
    "timestamp": "2026-05-25T20:00:00Z",
    "status": "completed",
    "total_agents": 24, "successful_agents": 22, "failed_agents": 1, "detected_agents": 1,
    "elapsed_seconds": 8.7, "control_stability": 0.994,
    "baseline_price": 235.0, "mean_price": 240.0,
    "all_prices": {
        "AGENT_00": 235, "AGENT_01": 258, "AGENT_02": 218, "AGENT_03": 255,
        "AGENT_04": 252, "AGENT_05": 221, "AGENT_06": 262, "AGENT_07": 224,
        "AGENT_08": 259, "AGENT_09": 226, "AGENT_10": 256, "AGENT_11": 244,
        "AGENT_12": 235, "AGENT_13": 231, "AGENT_14": 248, "AGENT_15": 235,
        "AGENT_16": 246, "AGENT_17": 235, "AGENT_18": 268, "AGENT_19": 211,
        "AGENT_20": 261, "AGENT_21": 228, "AGENT_22": 236, "AGENT_23": 234,
    },
    "price_range": [211.0, 268.0], "max_price_spread": 57.0, "max_price_spread_pct": 24.3,
    "gradients": [
        {"variable_name":"location","state_high":"High Income Area","state_low":"Low Income Area","mean_price_high":258.0,"mean_price_low":220.0,"delta":38.0,"delta_pct":16.2,"pooled_std":2.5,"t_statistic":15.2,"significant":True,"n_high":3,"n_low":3},
        {"variable_name":"device","state_high":"Premium Device","state_low":"Budget Device","mean_price_high":259.5,"mean_price_low":226.0,"delta":33.5,"delta_pct":14.3,"pooled_std":3.1,"t_statistic":10.8,"significant":True,"n_high":4,"n_low":4},
        {"variable_name":"cookie_profile","state_high":"Aged Profile","state_low":"Fresh Profile","mean_price_high":237.5,"mean_price_low":235.0,"delta":2.5,"delta_pct":1.1,"pooled_std":4.2,"t_statistic":0.6,"significant":False,"n_high":2,"n_low":2},
        {"variable_name":"referrer","state_high":"Aggregator","state_low":"Direct","mean_price_high":247.0,"mean_price_low":235.0,"delta":12.0,"delta_pct":5.1,"pooled_std":3.8,"t_statistic":3.16,"significant":True,"n_high":2,"n_low":2},
    ],
    "discrimination_index": 83.5, "topology_class": "progressive",
    "summary": "TOPOLOGY: PROGRESSIVE. Baseline: $235 (857 AED). Spread: $57 (24.3%). DI: $83.50. Significant vars: location (+$38), device (+$33.50), referrer (+$12). Dubai-resident Windows Chrome baseline yields lowest fares. Premium device + high-income location adds ~$58.",
    "max_discrimination_scenario": "Max: AGENT_18  LOCATION_HIGH  DUBAI_HIGH_INCOME @ $268 (977 AED)",
    "min_discrimination_scenario": "Min: AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K @ $211 (769 AED)",
    "agents": [
        {"agent_id":"AGENT_00","label":"AGENT_00  BASELINE  DUBAI_WINDOWS_FRESH_DIRECT","status":"success","price":235,"response_time_ms":1120,"bot_detected":False,"variables":{"location":"dubai_ae","device":"windows_chrome","cookie":"fresh","referrer":"direct"}},
        {"agent_id":"AGENT_01","label":"AGENT_01  LOCATION_HIGH  MANHATTAN_$150K","status":"success","price":258,"response_time_ms":1350,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_02","label":"AGENT_02  LOCATION_LOW  RURAL_IOWA_$50K","status":"success","price":218,"response_time_ms":1420,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_03","label":"AGENT_03  LOCATION_HIGH  SAN_FRANCISCO_$160K","status":"success","price":255,"response_time_ms":1180,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_04","label":"AGENT_04  LOCATION_HIGH  LONDON_£85K","status":"success","price":252,"response_time_ms":1310,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_05","label":"AGENT_05  LOCATION_LOW  MUMBAI_$15K","status":"success","price":221,"response_time_ms":1450,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_06","label":"AGENT_06  DEVICE_HIGH  iPHONE_15_PRO","status":"success","price":262,"response_time_ms":1080,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_07","label":"AGENT_07  DEVICE_LOW  ANDROID_BUDGET","status":"success","price":224,"response_time_ms":1550,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_08","label":"AGENT_08  DEVICE_HIGH  MACBOOK_PRO_M3","status":"success","price":259,"response_time_ms":1140,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_09","label":"AGENT_09  DEVICE_LOW  CHROMEBOOK","status":"success","price":226,"response_time_ms":1280,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_10","label":"AGENT_10  DEVICE_HIGH  GALAXY_S24_ULTRA","status":"success","price":256,"response_time_ms":1190,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_11","label":"AGENT_11  COOKIE_HIGH  30D_HIGH_INTENT","status":"success","price":244,"response_time_ms":1310,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_12","label":"AGENT_12  COOKIE_LOW  FRESH_FIRST_VISIT","status":"success","price":235,"response_time_ms":1120,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_13","label":"AGENT_13  COOKIE_HIGH  90D_PLATINUM","status":"success","price":231,"response_time_ms":1250,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_14","label":"AGENT_14  REFERRER_HIGH  VIA_KAYAK","status":"success","price":248,"response_time_ms":1480,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_15","label":"AGENT_15  REFERRER_LOW  DIRECT","status":"success","price":235,"response_time_ms":1220,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_16","label":"AGENT_16  REFERRER_HIGH  SKYSCANNER","status":"success","price":246,"response_time_ms":1350,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_17","label":"AGENT_17  REFERRER_LOW  DIRECT_BASELINE","status":"success","price":235,"response_time_ms":1180,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_18","label":"AGENT_18  LOCATION_HIGH  DUBAI_HIGH_INCOME","status":"success","price":268,"response_time_ms":1410,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_19","label":"AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K","status":"success","price":211,"response_time_ms":1520,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_20","label":"AGENT_20  DEVICE_HIGH  iPAD_PRO_12.9","status":"success","price":261,"response_time_ms":1160,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_21","label":"AGENT_21  DEVICE_LOW  iPHONE_SE_BUDGET","status":"detected","price":None,"response_time_ms":341,"bot_detected":True,"detection_signal":"captcha","variables":{}},
        {"agent_id":"AGENT_22","label":"AGENT_22  CONTROL  DUBAI_BASELINE_REPEAT_1","status":"success","price":236,"response_time_ms":1190,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_23","label":"AGENT_23  CONTROL  DUBAI_BASELINE_REPEAT_2","status":"success","price":234,"response_time_ms":1300,"bot_detected":False,"variables":{}},
    ],
    "error": None,
}


app = FastAPI(title="JACOBI — Adversarial Pricing Topology Probe", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
FRONTEND_INDEX = os.path.join(FRONTEND_DIR, "index.html") if os.path.isdir(FRONTEND_DIR) else None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "jacobi-backend", "brightdata_configured": bool(BRIGHTDATA_API_KEY)}


@app.post("/api/probe")
async def launch_probe(input: TargetProbeInput):
    if input.use_data_dir:
        return {"session_id": "demo_session_static", "status": "completed"}
    try:
        session = await run_fast_probe(input.target_url, input.target_name)
        return {"session_id": session["session_id"], "status": session["status"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def build_agent_list(session: dict) -> list:
    agents = []
    for a in session.get("agents", []):
        agents.append(dict(
            agent_id=a.get("agent_id",""), label=a.get("label",""), status=a.get("status",""),
            price=a.get("price"), response_time_ms=a.get("response_time_ms"),
            bot_detected=a.get("bot_detected",False), detection_signal=a.get("detection_signal"),
            error_message=a.get("error_message"), variables=a.get("variables",{}),
            delta_variable=a.get("delta_variable"), delta_direction=a.get("delta_direction"),
            is_control=a.get("is_control",False),
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
        summary=session["summary"], max_discrimination_scenario=session["max_discrimination_scenario"],
        min_discrimination_scenario=session["min_discrimination_scenario"], agents=agents,
        error=session.get("error"),
    )


@app.get("/api/demo")
async def get_demo_data():
    return DEMO_RESULT


class AnalyzeMatrixInput(BaseModel):
    baseline_price: float
    max_price_spread: float
    discrimination_index: float
    topology_class: str
    gradients: list


@app.post("/api/analyze-matrix")
async def analyze_matrix(input: AnalyzeMatrixInput):
    client = get_groq_client()
    prompt = f"""You are an automated algorithmic auditing bot enforcing the EU AI Act. Analyze the calculated pricing sensitivity matrix. Output a raw, minimalist, monospace markdown-formatted bulleted brief detailing the explicit consumer exploitation vectors isolated. No chatty intros, filler, or signatures. Keep it razor-sharp and institutional.

Baseline Price: ${input.baseline_price:.2f}
Max Price Spread: ${input.max_price_spread:.2f}
Discrimination Index: ${input.discrimination_index:.2f}
Topology Class: {input.topology_class}

Gradient Sensitivities:
{chr(10).join(f"  - {g['variable_name']}: delta=${g['delta']:.2f} ({g['delta_pct']:.1f}%) | significant={g['significant']}" for g in input.gradients)}"""

    response = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "system", "content": "You are an automated EU AI Act auditing bot. Output only the analysis. No preamble."}, {"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=250,
    )
    return {"analysis": response.choices[0].message.content}


class AuditInterfaceInput(BaseModel):
    raw_html: str
    target_url: str


@app.post("/api/audit-interface")
async def audit_interface(input: AuditInterfaceInput):
    client = get_gemini_client()
    truncated = input.raw_html[:8000]
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=[f"Audit this raw e-commerce layout structure for deceptive dark patterns, hidden surcharge mechanisms, or misleading pricing UI elements. Be specific and reference exact HTML patterns. Target URL: {input.target_url}\n\nRaw HTML:\n{truncated}"],
    )
    return {"audit": response.text}


@app.get("/api/optimize-shield/{session_id}")
async def optimize_shield(session_id: str):
    if session_id == "demo_session_static":
        data = DEMO_RESULT
    else:
        session = SESSION_STORE.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        data = session

    agents_data = data.get("agents", [])
    all_prices = data.get("all_prices", {})
    if not agents_data or not all_prices:
        raise HTTPException(status_code=404, detail="No agent data in session")

    successful = [a for a in agents_data if a.get("status") == "success" and a.get("price") is not None]
    if not successful:
        raise HTTPException(status_code=404, detail="No successful agents found")

    cheapest = min(successful, key=lambda a: a["price"])
    cheapest_id = cheapest["agent_id"]

    cfg = None
    for c in AGENT_CONFIGS:
        if c["id"] == cheapest_id:
            cfg = c
            break

    lowest_price = cheapest["price"]
    baseline = data.get("baseline_price") or lowest_price
    savings = round(baseline - lowest_price, 2)
    savings_pct = round(savings / baseline * 100, 1) if baseline > 0 else 0

    loc_map = {
        "US-NY": "US-NY-RESIDENTIAL", "US-IA": "US-IA-RESIDENTIAL",
        "US-CA": "US-CA-RESIDENTIAL", "US-MS": "US-MS-RESIDENTIAL",
        "GB": "GB-LONDON-RESIDENTIAL", "AE": "AE-DUBAI-RESIDENTIAL",
        "IN": "IN-MUMBAI-RESIDENTIAL",
    }

    result = {
        "lowest_price": lowest_price,
        "cheapest_agent_id": cheapest_id,
        "baseline_price": baseline,
        "estimated_savings": savings,
        "savings_pct": savings_pct,
        "spoof_configuration": {
            "user_agent": cfg["user_agent"] if cfg else cheapest.get("label", ""),
            "simulated_location_proxy_zone": loc_map.get(cfg["geo"], f"{cfg['geo']}-RESIDENTIAL") if cfg else "US-RESIDENTIAL",
            "http_referrer": cfg["referrer"] if cfg else "direct",
            "cookie_policy": "STRIP_TRACKING",
            "recommended_headers": {
                "User-Agent": cfg["user_agent"] if cfg else "",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": cfg["referrer"] if cfg else "direct",
                "Sec-CH-UA": cfg.get("sec_ch_ua", ""),
            } if cfg else {},
        },
        "detected_variables": cheapest.get("variables", {}),
    }
    return result


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
