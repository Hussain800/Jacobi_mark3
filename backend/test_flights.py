import httpx, asyncio, re
from brightdata_config import BRIGHTDATA_UNLOCKER_ZONE, brightdata_auth_headers

async def t():
    async with httpx.AsyncClient(timeout=30) as c:
        url = "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB"
        payload = {'url': url, 'zone': BRIGHTDATA_UNLOCKER_ZONE, 'format': 'raw'}
        r = await c.post('https://api.brightdata.com/request', json=payload, headers=brightdata_auth_headers())
        text = r.text
        
        # Find all dollar prices
        prices = re.findall(r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', text)
        numeric = []
        for p in prices:
            try:
                v = float(p.replace(',', ''))
                if 20 <= v <= 5000:
                    numeric.append(v)
            except: pass
        
        print(f"Found {len(numeric)} valid prices: {sorted(set(numeric))[:15]}")
        if numeric:
            print(f"Min: ${min(numeric):.0f}, Max: ${max(numeric):.0f}, Range: ${max(numeric)-min(numeric):.0f}")

asyncio.run(t())
