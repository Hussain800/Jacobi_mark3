import httpx, asyncio, re, json

async def t():
    async with httpx.AsyncClient(timeout=45) as c:
        url = "https://www.booking.com/hotel/in/the-leela-palace.html?checkin=2026-06-10&checkout=2026-06-11"
        payload = {"url": url, "zone": "mcp_unlocker", "format": "raw"}
        r = await c.post("https://api.brightdata.com/request", json=payload, headers={"Authorization": "Bearer 254d841d-f14d-4f4b-a394-3da0b03af036"})
        print(f"Status: {r.status_code}, size: {len(r.text)}")
        
        # Strip script/style
        visible = re.sub(r'<script[^>]*>.*?</script>', '', r.text, flags=re.DOTALL|re.I)
        visible = re.sub(r'<style[^>]*>.*?</style>', '', visible, flags=re.DOTALL|re.I)
        
        # Look for reasonable prices in visible text only
        prices = set()
        for m in re.finditer(r'\$\s*(\d{2,4}(?:\.\d{2})?)', visible):
            v = float(m.group(1))
            if 30 <= v <= 3000:
                prices.add(v)
        
        if prices:
            sp = sorted(prices)[:20]
            print(f"Visible USD prices: {sp}")
        else:
            print("No visible USD prices found")
        
        # Check JSON-LD
        for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', r.text, re.DOTALL):
            try:
                data = json.loads(m.group(1))
                if isinstance(data, dict):
                    print(f"JSON-LD: price={data.get('price')}, currency={data.get('priceCurrency')}")
            except: pass

asyncio.run(t())
