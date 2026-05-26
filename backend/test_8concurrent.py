import asyncio, sys
sys.path.insert(0, ".")
from main import BrightDataMCPClient, check_bot_detection, extract_price

async def t():
    client = BrightDataMCPClient()
    await client.start()
    url = "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB"
    
    # Test 8 concurrent requests (one wave)
    identities = [
        {"geo": "US-NY", "user_agent": f"Agent-{i}", "referrer": "https://www.google.com/", "cookie": "fresh"}
        for i in range(8)
    ]
    
    tasks = [client.probe_url(url, ident, 20.0) for ident in identities]
    results = await asyncio.gather(*tasks)
    
    for i, r in enumerate(results):
        status = "OK" if r["success"] else f"FAIL({r.get('error','')[:50]})"
        price = ""
        if r["success"]:
            p = extract_price(r["text"])
            det, sig = check_bot_detection(r["text"])
            price = f"price={p} bot={det}"
        print(f"Agent {i}: {status} {price} {r.get('elapsed_ms',0)}ms")
    
    await client.close()

asyncio.run(t())
