"""
Test the full AI provider fallback chain by directly calling analyze_report()
with modified environment variables to simulate different failure scenarios.
"""

import os
import sys
import json
import time
from datetime import datetime

# Add backend dir to path
sys.path.insert(0, os.path.dirname(__file__))

# Load .env so env vars are available
from dotenv import load_dotenv
load_dotenv()

RESULTS_FILE = r"C:\Users\wasif\OneDrive\Desktop\aegisagent\Jacobi\test-results.md"

# The DEMO_RESULT from main.py (copied here to avoid importing which starts the server)
DEMO_RESULT = {
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
    "summary": "TOPOLOGY: PROGRESSIVE. Baseline: $245.00/night. Spread: $57.00. DI: $87.10. Significant: 3 vars.",
    "max_discrimination_scenario": "Max: AGENT_18 @ $278.00",
    "min_discrimination_scenario": "Min: AGENT_19 @ $221.00",
    "agents": [
        {"agent_id":"AGENT_00","label":"AGENT_00  BASELINE  MACBOOK_MANHATTAN_FRESH_DIRECT","status":"success","price":245,"status":"success","price":245,"variables":{"location":"manhattan_high","device":"macbook_pro","cookie":"fresh","referrer":"direct"}},
        {"agent_id":"AGENT_18","label":"AGENT_18  LOCATION_HIGH  DUBAI_$110K","status":"success","price":278,"variables":{}},
        {"agent_id":"AGENT_19","label":"AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K","status":"success","price":221,"variables":{}},
    ],
    "error": None,
}


def validate_verdict(verdict, source):
    """Validate verdict structure. Returns list of errors (empty = pass)."""
    errors = []
    if verdict is None:
        return [f"[{source}] verdict is None"]
    
    # Check model_used
    model = getattr(verdict, 'model_used', '') or ''
    print(f"  Model used: {model}")
    
    fields = ["summary", "explanation", "max_saving_amount", "max_saving_percent",
              "cheapest_scenario_label", "cheapest_price", "most_expensive_scenario_label",
              "most_expensive_price", "recommendation", "recommendation_category",
              "fairness_rating", "fairness_explanation", "action_items", "confidence"]
    
    for field in fields:
        val = getattr(verdict, field, None)
        if val is None:
            errors.append(f"[{source}] Missing field: {field}")
    
    # Validate action_items
    ai = getattr(verdict, 'action_items', []) or []
    if not isinstance(ai, list) or len(ai) == 0:
        errors.append(f"[{source}] action_items is empty or not a list")
    else:
        for i, item in enumerate(ai):
            for f in ["action", "savings_estimate", "difficulty"]:
                if getattr(item, f, None) is None:
                    errors.append(f"[{source}] action_items[{i}] missing: {f}")
    
    return errors


def run_test(test_name, env_mods):
    """Run a test with modified env vars and return (model_used, errors)."""
    # Store original env
    originals = {}
    for k in env_mods:
        originals[k] = os.environ.get(k)
        
    # Apply modifications
    for k, v in env_mods.items():
        if v is None:
            if k in os.environ:
                del os.environ[k]
        else:
            os.environ[k] = v
    
    try:
        from gemini_analyzer import analyze_report
        
        # Clear cache for fresh run
        import gemini_analyzer
        gemini_analyzer._analysis_cache = {}
        
        print(f"\n{'='*60}")
        print(f"TEST: {test_name}")
        print(f"  Env mods: {env_mods}")
        
        start = time.time()
        verdict = analyze_report(DEMO_RESULT)
        elapsed = time.time() - start
        
        if verdict is None:
            print(f"  [FAIL] No verdict returned")
            return "NONE", ["No verdict returned"]
        
        model = getattr(verdict, 'model_used', 'unknown') or 'unknown'
        errors = validate_verdict(verdict, test_name)
        
        if errors:
            print(f"  [FAIL] Schema errors: {errors}")
        else:
            print(f"  [PASS] Elapsed: {elapsed:.1f}s | Confidence: {getattr(verdict, 'confidence', '?')}")
        
        return model, errors
    except Exception as e:
        print(f"  [ERROR] Exception: {e}")
        return "ERROR", [str(e)]
    finally:
        # Restore originals
        for k, v in originals.items():
            if v is None:
                if k in os.environ:
                    del os.environ[k]
            else:
                os.environ[k] = v


def main():
    print("=" * 60)
    print("JACOBI AI PROVIDER FALLBACK CHAIN TEST")
    print("=" * 60)
    print(f"Original env keys present:")
    for k in ["AIMLAPI_KEY", "GEMINI_API_KEY", "OPENCODE_API_KEY", "GROQ_API_KEY"]:
        v = os.environ.get(k, "")
        print(f"  {k}: {'✓ SET' if v else '✗ NOT SET'} (len={len(v)})")
    
    results = []
    
    # Test 1: Normal flow (all keys valid)
    model, errors = run_test("Normal flow (all keys)", {})
    results.append(("Normal flow (all APIs configured)", model, errors))
    
    # Test 2: Invalidate AI/ML API key — should try Gemini
    model, errors = run_test("AI/ML API disabled, fallback to Gemini", 
                             {"AIMLAPI_KEY": "invalid_key_test"})
    results.append(("AI/ML API disabled -> expect Gemini", model, errors))
    
    # Test 3: Invalidate AI/ML API + Gemini — should try OpenCode
    model, errors = run_test("AI/ML API + Gemini disabled, fallback to OpenCode",
                             {"AIMLAPI_KEY": "invalid", "GEMINI_API_KEY": "invalid"})
    results.append(("AI/ML API + Gemini disabled -> expect OpenCode", model, errors))
    
    # Test 4: Invalidate AI/ML API + Gemini + OpenCode — should try Groq
    model, errors = run_test("AI/ML API + Gemini + OpenCode disabled, fallback to Groq",
                             {"AIMLAPI_KEY": "invalid", "GEMINI_API_KEY": "invalid", 
                              "OPENCODE_API_KEY": "invalid"})
    results.append(("Top 3 disabled -> expect Groq", model, errors))
    
    # Test 5: Invalidate ALL API keys — should use heuristic fallback
    model, errors = run_test("ALL AI providers disabled, heuristic fallback",
                             {"AIMLAPI_KEY": None, "GEMINI_API_KEY": None,
                              "OPENCODE_API_KEY": None, "GROQ_API_KEY": None})
    results.append(("All APIs disabled -> expect statistical", model, errors))
    
    # Print summary
    print(f"\n{'='*60}")
    print("FALLBACK CHAIN SUMMARY")
    print(f"{'='*60}")
    print(f"{'Test':<50} {'Provider':<35} {'Result':<8}")
    print(f"{'-'*50} {'-'*35} {'-'*8}")
    
    for name, model, errors in results:
        if not errors:
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
        print(f"{name:<50} {model:<35} {status:<8}")
    
    # Build result lines for test-results.md
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    
    # Determine which providers were tested
    aiml_status = "UNTESTED"
    gemini_status = "UNTESTED"
    opencode_status = "UNTESTED"
    groq_status = "UNTESTED"
    heuristic_status = "UNTESTED"
    schema_status = "PASS"
    notes = []
    
    for name, model, errors in results:
        model_lower = model.lower()
        has_errors = bool(errors)
        
        if "normal flow" in name.lower():
            if "aimlapi" in model_lower or "gpt-4" in model_lower:
                aiml_status = "PASS"
            elif "gemini" in model_lower:
                aiml_status = "FAIL (fell through)"
                gemini_status = "PASS"
            elif "opencode" in model_lower or "deepseek" in model_lower:
                aiml_status = "FAIL (fell through)"
                gemini_status = "FAIL (fell through)"
                opencode_status = "PASS"
            elif "groq" in model_lower or "llama" in model_lower:
                aiml_status = "FAIL (fell through)"
                gemini_status = "FAIL (fell through)"
                opencode_status = "FAIL (fell through)"
                groq_status = "PASS"
            elif "statistical" in model_lower or "fallback" in model_lower:
                aiml_status = "FAIL"
                gemini_status = "FAIL"
                opencode_status = "FAIL"
                groq_status = "FAIL"
                heuristic_status = "PASS"
        
        if has_errors:
            schema_status = "FAIL"
            for e in errors:
                notes.append(e)
    
    # Override with fallback chain test results
    for name, model, errors in results:
        if "expect Gemini" in name and "gemini" in model.lower():
            gemini_status = "PASS"
        elif "expect Gemini" in name and model == "ERROR":
            gemini_status = "FAIL"
            notes.append("Gemini fallback test failed with exception")
            
        if "expect OpenCode" in name and ("opencode" in model.lower() or "deepseek" in model.lower()):
            opencode_status = "PASS"
            
        if "expect Groq" in name and ("groq" in model.lower() or "llama" in model.lower()):
            groq_status = "PASS"
        elif "expect Groq" in name and ("statistical" in model.lower() or "fallback" in model.lower()):
            groq_status = "FAIL (fell through to heuristic)"
            heuristic_status = "PASS"
            
        if "expect statistical" in name and ("statistical" in model.lower() or "fallback" in model.lower()):
            heuristic_status = "PASS"
    
    # Determine overall
    all_ok = all(s in ("PASS", "UNTESTED") for s in [aiml_status, gemini_status, opencode_status, groq_status, heuristic_status, schema_status])
    overall = "✅ PASS" if all_ok else "❌ FAIL"
    
    lines = [
        f"## AI Provider Fallback Chain Tests (run: {timestamp})",
        f"- **Overall**: {overall}",
        f"- AI/ML API (GPT-4o) — primary: {aiml_status}",
        f"- Gemini (gemini-2.0-flash) — fallback 1: {gemini_status}",
        f"- OpenCode Zen (DeepSeek V4 Flash Free) — fallback 2: {opencode_status}",
        f"- Groq (llama-3.3-70b) — fallback 3: {groq_status}",
        f"- Statistical heuristic — final fallback: {heuristic_status}",
        f"- Response schema validation: {schema_status}",
    ]
    
    if notes:
        lines.append("- Notes:")
        for note in notes:
            lines.append(f"  - {note}")
    else:
        lines.append("- Notes: (none)")
    
    lines.append("")
    
    with open(RESULTS_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join(lines))
    
    print(f"\n[WROTE] {RESULTS_FILE}")


if __name__ == "__main__":
    main()
