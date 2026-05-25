import httpx, asyncio, re

URLS = [
    "https://www.google.com/travel/flights?q=Flights+to+DXB+from+KTM",
    "https://www.kayak.com/flights/DXB-KTM/2026-06-15",
    "https://www.united.com/en/us/flightsearch?f=JFK&t=SFO&d=2026-06-15",
]

patterns = [r'\$\s*(\d[\d,.]*)', r'AED\s*(\d[\d,]*)', r'(\d[\d,]*)\s*AED', r'(\d[\d,]*)\s*د\.إ']

async def t():
    async with httpx.AsyncClient(timeout=30) as c:
        for url in URLS:
            print(f"\n=== {url[:60]}... ===")
            payload = {'url': url, 'zone': 'mcp_unlocker', 'format': 'raw'}
            r = await c.post('https://api.brightdata.com/request', json=payload, headers={'Authorization': 'Bearer 254d841d-f14d-4f4b-a394-3da0b03af036'})
            text = r.text
            print(f"HTML length: {len(text)}")
            for pat in patterns:
                matches = re.findall(pat, text, re.IGNORECASE)
                if matches:
                    print(f"  {pat}: {matches[:5]}")
            # Check for USD or AED symbols
            for sym in ['$', 'AED', 'د.إ']:
                count = text.count(sym)
                if count > 0:
                    print(f"  Symbol '{sym}': {count} occurrences")

asyncio.run(t())
