import asyncio, sys
sys.path.insert(0, ".")
from main import BrightDataMCPClient, parse_page_prices, check_bot_detection

async def t():
    client = BrightDataMCPClient()
    await client.start()
    url = "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB"
    
    identities = [
        {"geo": "AE", "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124", "referrer": "https://www.google.com/", "cookie": "fresh"},
        {"geo": "US-NY", "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) iPhone/604.1", "referrer": "https://www.kayak.com/", "cookie": "aged"},
    ]
    
    for i, ident in enumerate(identities):
        result = await client.probe_url(url, ident, 20.0)
        if result["success"]:
            detected, signal = check_bot_detection(result["text"])
            prices = parse_page_prices(result["text"], url)
            price = prices[0] if prices else None
            print(f"Agent {i}: bot={detected} prices={prices[:3]} len={len(result['text'])} elapsed={result['elapsed_ms']}ms")
        else:
            print(f"Agent {i}: FAILED - {result.get('error')}")
    
    await client.close()

asyncio.run(t())
