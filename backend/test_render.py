import httpx, asyncio, re, json
from brightdata_config import BRIGHTDATA_UNLOCKER_ZONE, brightdata_auth_headers

async def t():
    async with httpx.AsyncClient(timeout=90) as c:
        url = "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html?checkin=2026-06-10&checkout=2026-06-11"
        
        # Test with render=true (full JS rendering)
        payload = {"url": url, "zone": BRIGHTDATA_UNLOCKER_ZONE, "format": "raw"}
        r = await c.post("https://api.brightdata.com/request", json=payload, headers=brightdata_auth_headers())
        print(f"NO RENDER - Status: {r.status_code}, size: {len(r.text)}")
        
        # Try with render parameter (BrightData supports this)
        payload2 = {"url": url, "zone": BRIGHTDATA_UNLOCKER_ZONE, "format": "raw", "render": True}
        try:
            r2 = await c.post("https://api.brightdata.com/request", json=payload2, headers=brightdata_auth_headers())
            print(f"RENDER=true - Status: {r2.status_code}, size: {len(r2.text)}")
            if r2.status_code == 200:
                visible = re.sub(r'<script[^>]*>.*?</script>', '', r2.text, flags=re.DOTALL|re.I)
                visible = re.sub(r'<style[^>]*>.*?</style>', '', visible, flags=re.DOTALL|re.I)
                prices = []
                for m in re.finditer(r'\$\s*(\d{2,4}(?:\.\d{2})?)', visible):
                    v = float(m.group(1))
                    if 30 <= v <= 3000: prices.append(v)
                inr = []
                for m in re.finditer(r'(?:₹|INR)\s*(\d[\d,]*)', visible):
                    v = float(m.group(1).replace(",",""))
                    if 500 <= v <= 200000: inr.append(round(v*0.012,2))
                print(f"  USD prices after render: {sorted(set(prices))[:10]}")
                print(f"  INR→USD after render: {sorted(inr)[:10]}")
        except Exception as e:
            print(f"  RENDER error: {e}")

asyncio.run(t())
