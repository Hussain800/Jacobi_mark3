"""
Final verification of the AI provider pipeline.
Tests that the dead-code fix allows the chain to function correctly.
"""
import os, sys, json, time, httpx
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()

BASE = "http://localhost:8000"
RESULTS_FILE = r"C:\Users\wasif\OneDrive\Desktop\aegisagent\Jacobi\test-results.md"

EXPECTED_FIELDS = [
    "summary", "explanation",
    "max_saving_amount", "max_saving_percent",
    "cheapest_scenario_label", "cheapest_price",
    "most_expensive_scenario_label", "most_expensive_price",
    "recommendation", "recommendation_category",
    "fairness_rating", "fairness_explanation",
    "action_items", "confidence", "model_used",
]

def check_verdict(verdict, source):
    errors = []
    if not verdict:
        return [f"{source}: verdict is None"]
    for f in EXPECTED_FIELDS:
        if f not in verdict:
            errors.append(f"{source}: missing field '{f}'")
    ai = verdict.get("action_items", [])
    if not isinstance(ai, list) or len(ai) == 0:
        errors.append(f"{source}: action_items is empty/not a list")
    else:
        for i, item in enumerate(ai):
            for sub in ["action", "savings_estimate", "difficulty"]:
                if sub not in item:
                    errors.append(f"{source}: action_items[{i}] missing '{sub}'")
    c = verdict.get("confidence", -1)
    if not isinstance(c, (int, float)) or not (0 <= c <= 1):
        errors.append(f"{source}: confidence {c} out of range [0,1]")
    return errors

def test_endpoint(name, method, url, body=None):
    print(f"\n--- {name} ---")
    try:
        if method == "GET":
            r = httpx.get(url, timeout=120)
        else:
            r = httpx.post(url, json=body, timeout=120)
        elapsed = r.elapsed.total_seconds()
        print(f"  Status: {r.status_code} ({elapsed:.1f}s)")
        if r.status_code != 200:
            return None, [f"HTTP {r.status_code}"]
        data = r.json()
        verdict = data.get("gemini_report")
        model = (verdict or {}).get("model_used", "N/A")
        print(f"  Provider: {model}")
        errors = check_verdict(verdict, name)
        if errors:
            for e in errors:
                print(f"  FAIL: {e}")
        else:
            print(f"  PASS - schema valid")
        return verdict, errors
    except Exception as e:
        print(f"  EXCEPTION: {e}")
        return None, [str(e)]

def main():
    results = []
    
    # Test 1: GET /api/analyze-demo
    v1, e1 = test_endpoint("GET /api/analyze-demo", "GET", f"{BASE}/api/analyze-demo")
    results.append(("analyze-demo", v1, e1))
    
    # Test 2: POST /api/analyze
    v2, e2 = test_endpoint("POST /api/analyze (demo)", "POST",
                           f"{BASE}/api/analyze",
                           {"target_url": "https://example.com", "use_data_dir": "demo_session_static"})
    results.append(("analyze-post", v2, e2))
    
    # Determine provider from first successful response
    provider = "N/A"
    for name, v, e in results:
        if v and not e:
            provider = v.get("model_used", "N/A")
            break
    
    # Determine statuses
    aiml = "NOT_TESTED"
    gemini = "NOT_TESTED"
    opencode = "NOT_TESTED"
    groq = "NOT_TESTED"
    heuristic = "NOT_TESTED"
    schema_ok = True
    all_errors = []
    
    pl = (provider or "").lower()
    if "aimlapi" in pl or "gpt-4" in pl:
        aiml = "PASS"
    elif "opencode" in pl or "deepseek" in pl:
        aiml = "FAIL (fell through)"
        opencode = "PASS"
    elif "gemini" in pl:
        aiml = "FAIL (fell through)"
        gemini = "PASS"
    elif "groq" in pl or "llama" in pl:
        aiml = "FAIL (fell through)"
        opencode = "FAIL (fell through)"
        groq = "PASS"
    elif "statistical" in pl or "fallback" in pl:
        aiml = "FAIL"
        gemini = "FAIL"
        opencode = "FAIL"
        groq = "FAIL"
        heuristic = "PASS"
    
    for name, v, e in results:
        if e:
            schema_ok = False
            all_errors.extend(e)
    
    # Write results
    ts = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    overall = "PASS" if (schema_ok and aiml != "FAIL") else "FAIL"
    
    lines = [
        f"## AI Provider Pipeline - Final Validation (run: {ts})",
        f"- **Overall**: {overall}",
        f"- **Active provider**: {provider}",
        f"- AI/ML API (GPT-4o) — primary: {aiml}",
        f"- Gemini (gemini-2.0-flash) — fallback 1: {gemini}",
        f"- OpenCode Zen (DeepSeek V4 Flash Free) — fallback 2: {opencode}",
        f"- Groq (llama-3.3-70b) — fallback 3: {groq}",
        f"- Statistical heuristic — final fallback: {heuristic}",
        f"- Response schema validation: {'PASS' if schema_ok else 'FAIL'}",
    ]
    if all_errors:
        lines.append("- Errors:")
        for e in all_errors:
            lines.append(f"  - {e}")
    lines.append("")
    
    with open(RESULTS_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join(lines))
    
    print(f"\n=== RESULTS WRITTEN to {RESULTS_FILE} ===")
    print(f"Provider: {provider}")
    print(f"Schema: {'PASS' if schema_ok else 'FAIL'}")

if __name__ == "__main__":
    main()
