import asyncio, sys, re
sys.path.insert(0, ".")
from main import BrightDataMCPClient

async def t():
    client = BrightDataMCPClient()
    await client.start()
    
    url = "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB"
    result = await client.probe_url(url, {"geo": "AE", "user_agent": "test", "referrer": "", "cookie": ""}, 30.0)
    
    print(f"Success: {result['success']}")
    if result["success"]:
        text = result["text"]
        print(f"Page size: {len(text)} chars")
        
        from main import HONEYPOT_SIGNALS
        for s in HONEYPOT_SIGNALS:
            if s in text.lower():
                print(f"HONEYPOT TRIGGERED: {s}")
        
        prices = []
        for pat in [r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', r'(?:AED|د\.إ)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)']:
            for m in re.finditer(pat, text, re.IGNORECASE):
                try:
                    v = float(m.group(1).replace(",", ""))
                    if 20 <= v <= 5000:
                        prices.append(v)
                except: pass
        
        prices = sorted(set(round(p, 2) for p in prices))
        print(f"Valid prices found: {len(prices)}")
        if prices:
            print(f"Min: ${prices[0]:.0f}, Max: ${prices[-1]:.0f}, Count: {len(prices)}")
    else:
        print(f"Error: {result.get('error', 'unknown')}")
    
    await client.close()

asyncio.run(t())
