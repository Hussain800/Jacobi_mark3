import httpx, asyncio, re
from brightdata_config import BRIGHTDATA_UNLOCKER_ZONE, brightdata_auth_headers

async def t():
    async with httpx.AsyncClient(timeout=60) as c:
        url = "https://www.booking.com/hotel/us/the-knickerbocker.html?checkin=2026-07-10&checkout=2026-07-14&group_adults=2&no_rooms=1&selected_currency=USD"
        payload = {"url": url, "zone": BRIGHTDATA_UNLOCKER_ZONE, "format": "raw"}
        r = await c.post("https://api.brightdata.com/request", json=payload, headers=brightdata_auth_headers())
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            text = r.text
            print(f"Size: {len(text)} chars")
            for kw in ["price", "total", "night", "rate", "amount", "USD", "$"]:
                count = text.lower().count(kw)
                if count > 0:
                    print(f'  "{kw}": {count}x')
            for m in re.finditer(r'"price"\s*:\s*"?(\d+\.?\d*)"?', text):
                print(f"  JSON price key: {m.group(1)}")
            for m in re.finditer(r'\$\s*(\d{2,5}(?:\.\d{2})?)', text):
                print(f"  USD literal: ${m.group(1)}")

asyncio.run(t())
