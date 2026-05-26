import asyncio, traceback, sys
sys.path.insert(0, ".")
from main import run_fast_probe

async def t():
    try:
        r = await run_fast_probe(
            "https://www.flydubai.com/en/plan/flights/select-flights?from=DXB&to=KTM&departureDate=2026-06-15&adults=1",
            "DXB-KTM"
        )
        print(f"Status: {r['status']}")
        print(f"Baseline: {r.get('baseline_price')}")
        print(f"Success: {r.get('successful_agents')}/{r.get('total_agents')}")
        if r.get('error'):
            print(f"Error: {r['error']}")
    except Exception as e:
        traceback.print_exc()

asyncio.run(t())
