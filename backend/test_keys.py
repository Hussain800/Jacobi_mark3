"""Quick test of all API keys."""
from dotenv import load_dotenv
load_dotenv()
import os, json, httpx, time

def test_provider(name, url, key_env, model, body_extra=None):
    key = os.getenv(key_env, "")
    if not key:
        print(f"  [{name}] SKIP - no {key_env}")
        return
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You output JSON only."},
            {"role": "user", "content": 'Return {"status":"ok","provider":"' + name + '"}'},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 100,
    }
    if body_extra:
        payload.update(body_extra)
    try:
        start = time.time()
        r = httpx.post(url, json=payload, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, timeout=15)
        elapsed = time.time() - start
        if r.status_code == 200:
            content = r.json()["choices"][0]["message"]["content"]
            print(f"  [{name}] OK ({elapsed:.1f}s) - {content[:80]}")
        else:
            print(f"  [{name}] FAIL HTTP {r.status_code} ({elapsed:.1f}s) - {r.text[:80]}")
    except Exception as e:
        print(f"  [{name}] FAIL EXCEPTION: {e}")

print("=== Provider Key Tests ===\n")

test_provider("AI/ML API", "https://api.aimlapi.com/v1/chat/completions", "AIMLAPI_KEY", "gpt-4o")
test_provider("OpenCode Zen", "https://opencode.ai/zen/v1/chat/completions", "OPENCODE_API_KEY", "deepseek-v4-flash-free")
test_provider("Groq", "https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY", "llama-3.3-70b-versatile")

# Gemini test (different API structure)
key = os.getenv("GEMINI_API_KEY", "")
if key:
    try:
        from google.genai import Client, types
        client = Client(api_key=key)
        start = time.time()
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents='Return a JSON object with one field: "status" set to "ok".',
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
                max_output_tokens=100,
            )
        )
        elapsed = time.time() - start
        data = json.loads(response.text)
        if data.get("status") == "ok":
            print(f"  [Gemini] OK ({elapsed:.1f}s)")
        else:
            print(f"  [Gemini] Unexpected ({elapsed:.1f}s): {response.text[:80]}")
    except Exception as e:
        print(f"  [Gemini] FAIL: {e}")
else:
    print("  [Gemini] SKIP - no GEMINI_API_KEY")

print("\n=== Done ===")
