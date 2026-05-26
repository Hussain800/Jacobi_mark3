"""
Gemini-powered analysis of Jacobi probe results.
Transforms statistical topology data into plain-English consumer advice.

⚠️ CRITICAL: Use google-genai (v2.6+), NOT google-generativeai (DEPRECATED).
"""

import hashlib
import json
import os
import time
from typing import List, Optional

from pydantic import BaseModel, Field

# ─── Gemini SDK — google-genai v2.6+ (NOT google.generativeai) ────────
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

_analysis_cache: dict = {}  # In-memory cache: hash(probe_data) -> verdict


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


def analyze_report(probe_data: dict) -> Optional[GeminiVerdict]:
    """
    Synchronous wrapper around the Gemini analysis pipeline.

    Called by main.py's /api/analyze endpoint. Uses the heuristic fallback
    when the Gemini SDK is unavailable or no API key is configured.
    Returns None if probe_data is empty.
    """
    if not probe_data:
        return None

    probed = probe_data.copy() if probe_data else {}

    # Check cache
    ck = _cache_key(probed)
    if ck in _analysis_cache:
        return _analysis_cache[ck]

    # Attempt Gemini sync call if available
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
                _analysis_cache[ck] = verdict
                return verdict
            except Exception as e:
                print(f"[GEMINI] API call failed (using statistical fallback): {e}")

    # Heuristic fallback (always works, no network needed)
    verdict = _fallback_verdict(probed)
    _analysis_cache[ck] = verdict
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
    if ck in _analysis_cache:
        return _analysis_cache[ck]

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
        _analysis_cache[ck] = verdict

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
