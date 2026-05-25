import httpx, asyncio, re

async def t():
    async with httpx.AsyncClient(timeout=45) as c:
        url = "https://www.booking.com/hotel/in/the-leela-palace.html?checkin=2026-06-10&checkout=2026-06-11"
        payload = {"url": url, "zone": "mcp_unlocker", "format": "raw"}
        r = await c.post("https://api.brightdata.com/request", json=payload, headers={"Authorization": "Bearer 254d841d-f14d-4f4b-a394-3da0b03af036"})
        visible = re.sub(r'<script[^>]*>.*?</script>', '', r.text, flags=re.DOTALL|re.I)
        visible = re.sub(r'<style[^>]*>.*?</style>', '', visible, flags=re.DOTALL|re.I)
        
        # Check for INR
        inr_count = visible.count("INR") + visible.count("₹")
        usd_count = visible.count("$") - visible.count("<script") 
        print(f"INR/₹ occurrences: {inr_count}")
        print(f"USD/$ occurrences: {usd_count}")
        
        # Extract INR prices
        inr_prices = set()
        for m in re.finditer(r'(?:₹|INR)\s*(\d[\d,]*)', visible):
            try:
                v = float(m.group(1).replace(",", ""))
                if 1000 <= v <= 200000:
                    inr_prices.add(v)
            except: pass
        if inr_prices:
            sp = sorted(inr_prices)[:10]
            print(f"INR prices: {sp}")
            print(f"INR→USD (0.012): {[round(p*0.012) for p in sp]}")
        
        # Extract USD prices
        usd_prices = set()
        for m in re.finditer(r'\$\s*(\d{2,4}(?:\.\d{2})?)', visible):
            try:
                v = float(m.group(1))
                if 20 <= v <= 5000:
                    usd_prices.add(v)
            except: pass
        if usd_prices:
            sp = sorted(usd_prices)[:10]
            print(f"USD prices: {sp}")

asyncio.run(t())
