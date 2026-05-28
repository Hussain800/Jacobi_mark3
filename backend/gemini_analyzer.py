"""
Multi-provider AI analysis of Jacobi probe results.
Priority: OpenCode Zen (DeepSeek V4 Flash Free) → Gemini → statistical fallback.
"""

import hashlib
import json
import os
import time
from typing import Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

# ─── Sync / Async HTTP helpers ────────────────────────────────────────


def _call_llm_sync(
    url: str,
    payload: dict,
    headers: Dict[str, str],
    timeout: float = 30.0,
) -> httpx.Response:
    return httpx.post(url, json=payload, headers=headers, timeout=timeout)


async def _call_llm_async(
    url: str,
    payload: dict,
    headers: Dict[str, str],
    timeout: float = 30.0,
) -> httpx.Response:
    async with httpx.AsyncClient(timeout=timeout) as client:
        return await client.post(url, json=payload, headers=headers)


# ─── Gemini SDK (fallback provider) ────────────────────────────────────
try:
    from google.genai import Client, types
except ImportError:
    Client = None
    types = None


# ─── Response Model ───────────────────────────────────────────────────

class ActionItem(BaseModel):
    action: str = Field(..., description="Concrete action the consumer should take")
    savings_estimate: Optional[float] = Field(None, description="Estimated dollar savings")
    difficulty: str = Field(default="easy", description="easy, medium, hard")


class GeminiVerdict(BaseModel):
    """Structured output from Gemini analysis."""

    # One-line summary (shown as headline)
    summary: str = Field(..., description="One-line verdict")

    # Multi-paragraph plain English explanation
    explanation: str = Field(..., description="Detailed plain-English analysis")

    # Maximum potential savings
    max_saving_amount: float = Field(..., description="Maximum dollars a consumer could save")
    max_saving_percent: float = Field(..., description="Savings as percentage of baseline")

    # Best alternative (cheapest combination)
    cheapest_scenario_label: str = Field(..., description="Cheapest agent profile description")
    cheapest_price: float = Field(..., description="Cheapest price found")
    most_expensive_scenario_label: str = Field(..., description="Most expensive agent profile")
    most_expensive_price: float = Field(..., description="Most expensive price found")

    # Recommendation
    recommendation: str = Field(..., description="Single best action for the consumer")
    recommendation_category: str = Field(..., description="vpn, clear_cookies, use_different_device, use_aggregator, no_action")

    # Fairness assessment
    fairness_rating: str = Field(..., description="Fair, Somewhat Unfair, Very Unfair, Extremely Unfair")
    fairness_explanation: str = Field(..., description="Why this fairness rating was given")

    # Action items
    action_items: List[ActionItem] = Field(..., description="Ordered list of actions by savings impact")

    # Confidence
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in this analysis")

    # Raw data reference
    analysis_timestamp: str = ""
    model_used: str = ""


# ─── Cache ────────────────────────────────────────────────────────────

_analysis_cache: dict = {}  # In-memory cache: hash(probe_data) -> {"verdict": ..., "timestamp": ...}
_cache_order: list = []  # Insertion order for eviction (oldest first)
MAX_CACHE_SIZE = 100
CACHE_TTL_SECONDS = 3600


def _cache_get(key: str):
    entry = _analysis_cache.get(key)
    if entry is None:
        return None
    if time.time() - entry["timestamp"] > CACHE_TTL_SECONDS:
        _analysis_cache.pop(key, None)
        if key in _cache_order:
            _cache_order.remove(key)
        return None
    return entry["verdict"]


def _cache_set(key: str, verdict):
    _analysis_cache[key] = {"verdict": verdict, "timestamp": time.time()}
    _cache_order.append(key)
    if len(_analysis_cache) > MAX_CACHE_SIZE and len(_cache_order) > 1:
        oldest = _cache_order.pop(0)
        _analysis_cache.pop(oldest, None)


def _cache_key(probe_data: dict) -> str:
    """Generate a cache key from the probe data."""
    key_data = {
        "prices": probe_data.get("all_prices", {}),
        "gradients": probe_data.get("gradients", []),
        "baseline": probe_data.get("baseline_price"),
    }
    return hashlib.sha256(json.dumps(key_data, sort_keys=True).encode()).hexdigest()[:16]


# ─── Prompt Engineering ───────────────────────────────────────────────

SYSTEM_PROMPT = """You are Jacobi's Consumer Pricing Analyst — an AI that translates pricing discrimination data into plain-English advice for consumers.

## CONTEXT
You receive structured data from a 24-agent adversarial pricing probe that tested a travel/hotel website across 4 dimensions:
1. **Location** (high-income area vs low-income area)
2. **Device** (premium device vs budget device)
3. **Cookie profile** (aged/high-intent vs fresh profile)
4. **Referrer** (via aggregator/Kayak vs direct visit)

## YOUR JOB
Analyze the probe results and provide a clear, actionable verdict in JSON format.

## RULES
1. Be DIRECT and HONEST — tell the user exactly what's happening.
2. Use PLAIN ENGLISH — no jargon, no statistics.
3. Quantify the discrimination in DOLLARS: "You're being charged $47 more because..."
4. Give SPECIFIC action: "Switch to a VPN in Iowa" not just "use a VPN".
5. Rank action items by savings potential.
6. If no significant discrimination is found, say that too.
7. Be CONVERSATIONAL but professional — like a friend who's a pricing expert.
8. The fairness_rating should reflect real consumer impact.
9. confidence should be high (0.85+) if data is statistically significant.

## OUTPUT FORMAT
Return ONLY valid JSON matching the expected schema. No markdown, no explanation outside the JSON.
"""


def _build_probe_context(probe_data: dict) -> str:
    """Build the context block about probe results for Gemini."""
    target = probe_data.get("target_name", probe_data.get("target_url", "Unknown"))
    baseline = probe_data.get("baseline_price", 0)
    spread = probe_data.get("max_price_spread", 0)
    spread_pct = probe_data.get("max_price_spread_pct", 0)
    topology = probe_data.get("topology_class", "unknown")
    gradients = probe_data.get("gradients", [])

    context = f"""## Probe Results
**Target**: {target}
**Baseline Price**: ${baseline:.2f}
**Price Spread**: ${spread:.2f} ({spread_pct:.1f}%)
**Topology**: {topology}

### Price Gradients (significant discrimination factors):
"""

    sig_gradients = [g for g in gradients if g.get("significant")]
    non_sig = [g for g in gradients if not g.get("significant")]

    for g in sig_gradients:
        context += f"""- **{g['variable_name']}**: ${g['delta']:.2f} ({g['delta_pct']:.1f}%) — {g['state_high']} vs {g['state_low']}
  High: ${g['mean_price_high']:.2f} | Low: ${g['mean_price_low']:.2f}
"""

    if non_sig:
        context += "\n### Non-Significant Factors:\n"
        for g in non_sig:
            context += f"- {g['variable_name']}: ${g['delta']:.2f} (not statistically significant)\n"

    # Add cheapest and most expensive
    all_prices = probe_data.get("all_prices", {})
    agents = probe_data.get("agents", [])

    valid_agents = [a for a in agents if a.get("price") is not None]
    if valid_agents:
        cheapest = min(valid_agents, key=lambda a: a["price"])
        expensive = max(valid_agents, key=lambda a: a["price"])
        context += f"""
### Extreme Scenarios
- **Cheapest**: {cheapest['label']} @ ${cheapest['price']:.2f}
- **Most Expensive**: {expensive['label']} @ ${expensive['price']:.2f}
"""

    return context


# ─── Public API Alias (matches main.py import) ──────────────────────────

GeminiReport = GeminiVerdict

# ─── OpenCode Zen (DeepSeek V4 Flash Free) — Primary Provider ──────────

OPENCODE_API_URL = "https://opencode.ai/zen/v1/chat/completions"
OPENCODE_MODEL = "deepseek-v4-flash-free"

_VERDICT_SCHEMA_JSON = json.dumps(GeminiVerdict.model_json_schema(), indent=2)


def _build_opencode_messages(probe_data: dict) -> list:
    """Build messages array for OpenCode/OpenAI-compatible chat completions."""
    context = _build_probe_context(probe_data)
    schema_prompt = (
        "You MUST respond with valid JSON matching this exact schema:\n"
        f"{_VERDICT_SCHEMA_JSON}\n\n"
        "Return ONLY the JSON object. No markdown, no code fences, no extra text."
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Probe results to analyze:\n\n{context}\n\n{schema_prompt}"},
    ]


def _parse_verdict_from_json(raw: str, model_tag: str, probe_ts: str) -> Optional[GeminiVerdict]:
    """Parse and validate a JSON string into a GeminiVerdict."""
    try:
        data = json.loads(raw)
        # If the model wrapped the JSON in markdown code fences, strip them
        if isinstance(data, str):
            data = json.loads(data)
        verdict = GeminiVerdict.model_validate(data)
        verdict.analysis_timestamp = probe_ts
        verdict.model_used = model_tag
        return verdict
    except Exception as e:
        print(f"[AI] Failed to parse verdict JSON from {model_tag}: {e}")
        return None


def _analyze_with_opencode(probe_data: dict) -> Optional[GeminiVerdict]:
    """Analyze probe results via OpenCode Zen (DeepSeek V4 Flash Free)."""
    api_key = os.getenv("OPENCODE_API_KEY")
    if not api_key:
        return None

    messages = _build_opencode_messages(probe_data)
    try:
        response = _call_llm_sync(
            OPENCODE_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            payload={
                "model": OPENCODE_MODEL,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": 4096,
                "response_format": {"type": "json_object"},
            },
            timeout=30.0,
        )
        if response.status_code != 200:
            print(f"[OPENCODE] API returned {response.status_code}: {response.text[:200]}")
            return None

        body = response.json()
        content = body["choices"][0]["message"]["content"]
        return _parse_verdict_from_json(content, "deepseek-v4-flash-free (OpenCode)", probe_data.get("timestamp", ""))
    except Exception as e:
        print(f"[OPENCODE] Request failed: {e}")
        return None


# ─── Main Analysis Pipeline ────────────────────────────────────────────


def analyze_report(probe_data: dict) -> Optional[GeminiVerdict]:
    """
    Analyze probe results using the best available AI provider.
    Priority: AI/ML API → Gemini → OpenCode Zen (DeepSeek) → Groq → heuristic fallback.
    """
    if not probe_data:
        return None

    probed = probe_data.copy() if probe_data else {}

    ck = _cache_key(probed)
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    # 1. Try AI/ML API (partner provider, primary)
    aiml_key = os.getenv("AIMLAPI_KEY")
    if aiml_key:
        try:
            aiml_model = os.getenv("AIMLAPI_MODEL", "gpt-4o")
            context = _build_probe_context(probed)
            schema_prompt = (
                "You MUST respond with valid JSON matching this exact schema:\n"
                f"{_VERDICT_SCHEMA_JSON}\n\n"
                "Return ONLY the JSON object. No markdown, no code fences, no extra text."
            )
            payload = {
                "model": aiml_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"{context}\n\nAnalyze these results and provide your verdict in JSON format.\n\n{schema_prompt}"},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                "max_tokens": 2048,
            }
            resp = _call_llm_sync(
                "https://api.aimlapi.com/v1/chat/completions",
                payload=payload,
                headers={"Authorization": f"Bearer {aiml_key}", "Content-Type": "application/json"},
                timeout=30.0,
            )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                verdict = GeminiVerdict.model_validate_json(content)
                verdict.analysis_timestamp = probed.get("timestamp", "")
                verdict.model_used = f"aimlapi/{aiml_model}"
                _cache_set(ck, verdict)
                return verdict
            else:
                print(f"[AIMLAPI] API returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"[AIMLAPI] API call failed: {e}")

    # 2. Try Gemini
    if Client is not None:
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
            try:
                client = Client(api_key=api_key)
                context = _build_probe_context(probed)
                response = client.models.generate_content(
                    model=model_name,
                    contents=f"{SYSTEM_PROMPT}\n\n{context}\n\nAnalyze these results and provide your verdict in JSON format.",
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=GeminiVerdict,
                        temperature=0.2,
                        top_p=0.95,
                        max_output_tokens=2048,
                    )
                )
                verdict = GeminiVerdict.model_validate_json(response.text)
                verdict.analysis_timestamp = probed.get("timestamp", "")
                verdict.model_used = model_name
                _cache_set(ck, verdict)
                return verdict
            except Exception as e:
                print(f"[GEMINI] API call failed: {e}")

    # 3. Try OpenCode Zen (DeepSeek V4 Flash Free)
    verdict = _analyze_with_opencode(probed)
    if verdict is not None:
        _cache_set(ck, verdict)
        return verdict

    # 4. Try Groq
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            context = _build_probe_context(probed)
            schema_prompt = (
                "You MUST respond with valid JSON matching this exact schema:\n"
                f"{_VERDICT_SCHEMA_JSON}\n\n"
                "Return ONLY the JSON object. No markdown, no code fences, no extra text."
            )
            payload = {
                "model": groq_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"{context}\n\nAnalyze these results and provide your verdict in JSON format.\n\n{schema_prompt}"},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                "max_tokens": 2048,
            }
            resp = _call_llm_sync(
                "https://api.groq.com/openai/v1/chat/completions",
                payload=payload,
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                timeout=30.0,
            )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                verdict = GeminiVerdict.model_validate_json(content)
                verdict.analysis_timestamp = probed.get("timestamp", "")
                verdict.model_used = f"groq/{groq_model}"
                _cache_set(ck, verdict)
                return verdict
            else:
                print(f"[GROQ] API returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"[GROQ] API call failed: {e}")

    # 5. Heuristic fallback (always works)
    verdict = _fallback_verdict(probed)
    _cache_set(ck, verdict)
    return verdict


# ─── Main Analysis Function (using google-genai v2.6+ async API) ──────

async def analyze_probe_results(probe_data: dict) -> GeminiVerdict:
    """
    Analyze probe results using Gemini and return structured verdict.
    Uses caching to avoid redundant API calls.

    ⚠️ Uses google.genai.Client (NOT deprecated google.generativeai).
    Async via client.aio.models.generate_content() for true non-blocking.
    """
    # Check cache
    ck = _cache_key(probe_data)
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    # Check if Gemini SDK is available
    if Client is None:
        return _fallback_verdict(probe_data)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return _fallback_verdict(probe_data, "Gemini API key not configured")

    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    try:
        client = Client(api_key=api_key)

        context = _build_probe_context(probe_data)

        # Use async client (aio) — true async HTTP via httpx
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=f"{SYSTEM_PROMPT}\n\n{context}\n\nAnalyze these results and provide your verdict in JSON format.",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiVerdict,  # Pass Pydantic model directly!
                temperature=0.2,      # Low temp = deterministic, factual
                top_p=0.95,
                max_output_tokens=2048,
            )
        )

        # Parse response text directly into our Pydantic model
        verdict = GeminiVerdict.model_validate_json(response.text)
        verdict.analysis_timestamp = probe_data.get("timestamp", "")
        verdict.model_used = model_name

        # Cache the result
        _cache_set(ck, verdict)

        return verdict

    except Exception as e:
        return _fallback_verdict(probe_data, str(e))


def _fallback_verdict(probe_data: dict, error: str = "") -> GeminiVerdict:
    """Generate a verdict from probe statistics when Gemini is unavailable."""
    gradients = probe_data.get("gradients", [])
    baseline = probe_data.get("baseline_price", 0) or 0
    max_spread = probe_data.get("max_price_spread", 0) or 0

    sig_gradients = [g for g in gradients if g.get("significant")]
    max_delta_gradient = max(sig_gradients, key=lambda g: abs(g.get("delta", 0))) if sig_gradients else None

    # Build summary from data
    if max_delta_gradient:
        summary = f"Pricing varies by ${max_delta_gradient['delta']:.0f} based on {max_delta_gradient['variable_name']}. "
        summary += f"The cheapest option saves ${max_spread:.0f} vs the most expensive."
    else:
        summary = "Pricing appears uniform across all dimensions tested. No significant discrimination detected."

    # Build recommendation
    if max_delta_gradient and max_delta_gradient["variable_name"] == "location":
        rec = "Try browsing from a different location using a VPN. Rural areas often see lower prices."
        rec_cat = "vpn"
    elif max_delta_gradient and max_delta_gradient["variable_name"] == "device":
        rec = "Clear your browser cookies or use a different device. Premium device users may see higher prices."
        rec_cat = "clear_cookies"
    elif max_delta_gradient and max_delta_gradient["variable_name"] == "referrer":
        rec = "Try accessing the site directly instead of through price comparison sites."
        rec_cat = "use_aggregator"
    else:
        rec = "No action needed — prices are consistent across all profiles tested."
        rec_cat = "no_action"

    # Fairness
    spread_pct = probe_data.get("max_price_spread_pct", 0) or 0
    if spread_pct > 20:
        fairness = "Very Unfair"
    elif spread_pct > 10:
        fairness = "Somewhat Unfair"
    elif spread_pct > 5:
        fairness = "Somewhat Unfair"
    else:
        fairness = "Fair"

    action_items = []
    if max_delta_gradient:
        action_items.append(ActionItem(
            action=rec,
            savings_estimate=round(max_delta_gradient["delta"], 2),
            difficulty="easy"
        ))

    agents = probe_data.get("agents", [])
    valid = [a for a in agents if a.get("price") is not None]
    cheapest = min(valid, key=lambda a: a["price"]) if valid else None
    expensive = max(valid, key=lambda a: a["price"]) if valid else None

    grad_lines = ". ".join(f"{g.get('variable_name', '?')} varies by ${g.get('delta', 0):.0f}" for g in sig_gradients)
    return GeminiVerdict(
        summary=summary,
        explanation=f"The pricing topology probe found {len(sig_gradients)} significant pricing factors. "
                    + grad_lines
                    + (f" (Fallback analysis: {error})" if error else ""),
        max_saving_amount=round(max_spread, 2),
        max_saving_percent=round((max_spread / baseline * 100) if baseline else 0, 1),
        cheapest_scenario_label=cheapest["label"] if cheapest else "Unknown",
        cheapest_price=cheapest["price"] if cheapest else 0,
        most_expensive_scenario_label=expensive["label"] if expensive else "Unknown",
        most_expensive_price=expensive["price"] if expensive else 0,
        recommendation=rec,
        recommendation_category=rec_cat,
        fairness_rating=fairness,
        fairness_explanation=f"Prices vary by {spread_pct:.1f}% across {len(sig_gradients)} factors.",
        action_items=action_items,
        confidence=0.85 if sig_gradients else 0.95,
        analysis_timestamp=probe_data.get("timestamp", ""),
        model_used="statistical_fallback"
    )
