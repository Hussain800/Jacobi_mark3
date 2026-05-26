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

load_dotenv()
BRIGHTDATA_API_KEY = os.getenv("BRIGHTDATA_API_KEY", "254d841d-f14d-4f4b-a394-3da0b03af036")


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
    {"id":"AGENT_00","label":"AGENT_00  BASELINE  MACBOOK_MANHATTAN_FRESH_DIRECT","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=base_00; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":0,"is_control":True},
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
    {"id":"AGENT_22","label":"AGENT_22  CONTROL  BASELINE_REPEAT_1","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=control_22; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":2,"is_control":True},
    {"id":"AGENT_23","label":"AGENT_23  CONTROL  BASELINE_REPEAT_2","user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15","geo":"US-NY","referrer":"https://www.united.com/","cookie":"session_id=control_23; visit_count=1; last_visit=none","sec_ch_ua":'"Not/A)Brand";v="99", "Safari";v="17.4"',"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"},"wave":2,"is_control":True},
]

WAVE_CONFIGS: Dict[int, List[dict]] = {}
for cfg in AGENT_CONFIGS:
    WAVE_CONFIGS.setdefault(cfg["wave"], []).append(cfg)

WAVE_STAGGER_S = 2.0

PRICE_PATTERN = re.compile(r"\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)")
ALT_PRICE_PATTERNS = [
    re.compile(r"USD\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)", re.IGNORECASE),
    re.compile(r"fare[:\s]*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)", re.IGNORECASE),
    re.compile(r"total[:\s]*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)", re.IGNORECASE),
]
NOISE_PATTERNS = [re.compile(p) for p in [
    r"session[a-z_]*=[a-z0-9]{16,}", r"token[a-z_]*=[a-z0-9]{20,}",
    r"csrf[a-z_]*=[a-z0-9]{20,}", r"viewstate[a-z_]*=[a-zA-Z0-9+/]{50,}",
]]
HONEYPOT_SIGNALS = [
    "captcha", "confirm you are human", "unusual traffic", "too many requests",
    "access denied", "check your browser", "blocked", "rate limit",
    "please wait", "automated query", "sorry", "verify your identity",
]


def extract_price(text: str) -> Optional[float]:
    cleaned = text
    for pat in NOISE_PATTERNS:
        cleaned = pat.sub("", cleaned)
    candidates: List[float] = []
    for m in PRICE_PATTERN.finditer(cleaned):
        try:
            p = float(m.group(1).replace(",", ""))
            candidates.append(p)
        except ValueError:
            continue
    if not candidates:
        for alt_pat in ALT_PRICE_PATTERNS:
            for m in alt_pat.finditer(cleaned):
                try:
                    p = float(m.group(1).replace(",", ""))
                    candidates.append(p)
                except ValueError:
                    continue
    valid = [p for p in candidates if 20.0 <= p <= 5000.0]
    return max(valid) if valid else None


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
        self._session = None

    async def start(self):
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
        env = {"API_TOKEN": self.api_key, "PRO_MODE": "true"}
        server_params = StdioServerParameters(command="npx", args=["-y", "@brightdata/mcp"], env=env)
        self._read, self._write = await stdio_client(server_params).__aenter__()
        self._session = await ClientSession(self._read, self._write).__aenter__()
        await self._session.initialize()

    async def probe_url(self, url: str, identity: dict, timeout_s: float = 15.0) -> dict:
        if not self._session:
            raise RuntimeError("MCP session not initialized")
        start_ts = time.time()
        geo = identity.get("geo", "US")
        nav_args = {"url": url, "proxy_country": geo.split("-")[0]}
        if geo == "US-NY": nav_args["proxy_state"] = "NY"
        elif geo == "US-IA": nav_args["proxy_state"] = "IA"
        elif geo == "US-CA": nav_args["proxy_state"] = "CA"
        elif geo == "US-MS": nav_args["proxy_state"] = "MS"
        try:
            await asyncio.wait_for(self._session.call_tool("scraping_browser_navigate", nav_args), timeout=timeout_s)
            await asyncio.sleep(1.5)
            text_result = await asyncio.wait_for(self._session.call_tool("scraping_browser_get_text", {}), timeout=timeout_s)
            elapsed_ms = int((time.time() - start_ts) * 1000)
            page_text = text_result.content[0].text if text_result and text_result.content else ""
            return {"success": True, "text": page_text, "elapsed_ms": elapsed_ms}
        except asyncio.TimeoutError:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000), "error": f"Timeout {timeout_s}s"}
        except Exception as e:
            return {"success": False, "elapsed_ms": int((time.time() - start_ts) * 1000), "error": str(e)}

    async def close(self):
        try:
            if self._session: await self._session.__aexit__(None, None, None)
            if hasattr(self, "_write") and self._write: await self._write.close()
            if hasattr(self, "_read") and self._read: await self._read.close()
        except Exception: pass


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
        delta_direction=cfg.get("delta_direction"), is_control=cfg.get("is_control", False))
    try:
        r = await bd.probe_url(url, cfg, 15.0)
        if not r["success"]:
            s["status"] = "failed"; s["error_message"] = r.get("error", "Unknown"); s["response_time_ms"] = r.get("elapsed_ms", 0); return s
        s["response_time_ms"] = r.get("elapsed_ms", 0)
        detected, signal = check_bot_detection(r.get("text", ""))
        if detected:
            s["status"] = "detected"; s["bot_detected"] = True; s["detection_signal"] = signal; return s
        price = extract_price(r.get("text", ""))
        if price is None:
            s["status"] = "failed"; s["error_message"] = "No valid price found"; return s
        s["price"] = price; s["status"] = "success"; return s
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
    "target_url": "https://www.united.com/en/us/flightdetails?flight=UA123&date=2026-06-01",
    "target_name": "UA123 JFK→SFO",
    "timestamp": "2026-05-25T20:00:00Z",
    "status": "completed",
    "total_agents": 24, "successful_agents": 22, "failed_agents": 1, "detected_agents": 1,
    "elapsed_seconds": 8.7, "control_stability": 0.994,
    "baseline_price": 347.0, "mean_price": 352.3,
    "all_prices": {
        "AGENT_00": 347, "AGENT_01": 371, "AGENT_02": 323, "AGENT_03": 368,
        "AGENT_04": 365, "AGENT_05": 329, "AGENT_06": 375, "AGENT_07": 335,
        "AGENT_08": 372, "AGENT_09": 338, "AGENT_10": 369, "AGENT_11": 358,
        "AGENT_12": 347, "AGENT_13": 343, "AGENT_14": 361, "AGENT_15": 347,
        "AGENT_16": 359, "AGENT_17": 347, "AGENT_18": 380, "AGENT_19": 320,
        "AGENT_20": 374, "AGENT_21": 341, "AGENT_22": 348, "AGENT_23": 346,
    },
    "price_range": [320.0, 380.0], "max_price_spread": 60.0, "max_price_spread_pct": 17.3,
    "gradients": [
        {"variable_name":"location","state_high":"High Income Area","state_low":"Low Income Area","mean_price_high":371.0,"mean_price_low":324.0,"delta":47.0,"delta_pct":13.5,"pooled_std":2.5,"t_statistic":18.8,"significant":True,"n_high":3,"n_low":3},
        {"variable_name":"device","state_high":"Premium Device","state_low":"Budget Device","mean_price_high":372.5,"mean_price_low":338.0,"delta":34.5,"delta_pct":9.9,"pooled_std":3.1,"t_statistic":11.13,"significant":True,"n_high":4,"n_low":4},
        {"variable_name":"cookie_profile","state_high":"Aged Profile","state_low":"Fresh Profile","mean_price_high":350.5,"mean_price_low":347.0,"delta":3.5,"delta_pct":1.0,"pooled_std":4.2,"t_statistic":0.83,"significant":False,"n_high":2,"n_low":2},
        {"variable_name":"referrer","state_high":"Aggregator","state_low":"Direct","mean_price_high":360.0,"mean_price_low":347.0,"delta":13.0,"delta_pct":3.7,"pooled_std":3.8,"t_statistic":3.42,"significant":True,"n_high":2,"n_low":2},
    ],
    "discrimination_index": 94.5, "topology_class": "progressive",
    "discrimination_score": 91.8,
    "summary": "TOPOLOGY: PROGRESSIVE. Baseline: $347.00. Spread: $60.00. DI: $94.50. Significant: 3 vars. location: +$47.00; device: +$34.50; referrer: +$13.00.",
    "max_discrimination_scenario": "Max: AGENT_18  LOCATION_HIGH  DUBAI_$110K @ $380.00",
    "min_discrimination_scenario": "Min: AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K @ $320.00",
    "agents": [
        {"agent_id":"AGENT_00","label":"AGENT_00  BASELINE  MACBOOK_MANHATTAN_FRESH_DIRECT","status":"success","price":347,"response_time_ms":1120,"bot_detected":False,"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"}},
        {"agent_id":"AGENT_01","label":"AGENT_01  LOCATION_HIGH  MANHATTAN_$150K","status":"success","price":371,"response_time_ms":1350,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_02","label":"AGENT_02  LOCATION_LOW  RURAL_IOWA_$50K","status":"success","price":323,"response_time_ms":1420,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_03","label":"AGENT_03  LOCATION_HIGH  SAN_FRANCISCO_$160K","status":"success","price":368,"response_time_ms":1180,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_04","label":"AGENT_04  LOCATION_HIGH  LONDON_£85K","status":"success","price":365,"response_time_ms":1310,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_05","label":"AGENT_05  LOCATION_LOW  MUMBAI_$15K","status":"success","price":329,"response_time_ms":1450,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_06","label":"AGENT_06  DEVICE_HIGH  iPHONE_15_PRO","status":"success","price":375,"response_time_ms":1080,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_07","label":"AGENT_07  DEVICE_LOW  ANDROID_BUDGET","status":"success","price":335,"response_time_ms":1550,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_08","label":"AGENT_08  DEVICE_HIGH  MACBOOK_PRO_M3","status":"success","price":372,"response_time_ms":1140,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_09","label":"AGENT_09  DEVICE_LOW  CHROMEBOOK","status":"success","price":338,"response_time_ms":1280,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_10","label":"AGENT_10  DEVICE_HIGH  GALAXY_S24_ULTRA","status":"success","price":369,"response_time_ms":1190,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_11","label":"AGENT_11  COOKIE_HIGH  30D_HIGH_INTENT","status":"success","price":358,"response_time_ms":1310,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_12","label":"AGENT_12  COOKIE_LOW  FRESH_FIRST_VISIT","status":"success","price":347,"response_time_ms":1120,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_13","label":"AGENT_13  COOKIE_HIGH  90D_PLATINUM","status":"success","price":343,"response_time_ms":1250,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_14","label":"AGENT_14  REFERRER_HIGH  VIA_KAYAK","status":"success","price":361,"response_time_ms":1480,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_15","label":"AGENT_15  REFERRER_LOW  DIRECT","status":"success","price":347,"response_time_ms":1220,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_16","label":"AGENT_16  REFERRER_HIGH  SKYSCANNER","status":"success","price":359,"response_time_ms":1350,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_17","label":"AGENT_17  REFERRER_LOW  DIRECT_BASELINE","status":"success","price":347,"response_time_ms":1180,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_18","label":"AGENT_18  LOCATION_HIGH  DUBAI_$110K","status":"success","price":380,"response_time_ms":1410,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_19","label":"AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K","status":"success","price":320,"response_time_ms":1520,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_20","label":"AGENT_20  DEVICE_HIGH  iPAD_PRO_12.9","status":"success","price":374,"response_time_ms":1160,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_21","label":"AGENT_21  DEVICE_LOW  iPHONE_SE_BUDGET","status":"detected","price":None,"response_time_ms":341,"bot_detected":True,"detection_signal":"captcha","variables":{}},
        {"agent_id":"AGENT_22","label":"AGENT_22  CONTROL  BASELINE_REPEAT_1","status":"success","price":348,"response_time_ms":1190,"bot_detected":False,"variables":{}},
        {"agent_id":"AGENT_23","label":"AGENT_23  CONTROL  BASELINE_REPEAT_2","status":"success","price":346,"response_time_ms":1300,"bot_detected":False,"variables":{}},
    ],
    "error": None,
}


app = FastAPI(title="JACOBI — Adversarial Pricing Topology Probe", version="1.0.0")
# CORS: allow Vercel frontend + local dev
VERCEL_FRONTEND = os.environ.get("VERCEL_FRONTEND_URL", "https://jacobi.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", VERCEL_FRONTEND, "http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(export_router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
FRONTEND_INDEX = os.path.join(FRONTEND_DIR, "index.html") if os.path.isdir(FRONTEND_DIR) else None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "jacobi-backend", "brightdata_configured": bool(BRIGHTDATA_API_KEY)}


@app.post("/api/probe")
async def launch_probe(input: TargetProbeInput):
    """Launch a pricing probe. Falls back to demo data if BrightData MCP fails."""
    if input.use_data_dir:
        return {"session_id": "demo_session_static", "status": "completed"}
    try:
        session = await run_full_probe(input.target_url, input.target_name)
        # Persist to Supabase
        try:
            await save_probe(session)
        except Exception as db_err:
            print(f"[MAIN] Supabase save skipped: {db_err}")
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
