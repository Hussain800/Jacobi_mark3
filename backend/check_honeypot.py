import httpx, asyncio
from brightdata_config import BRIGHTDATA_UNLOCKER_ZONE, brightdata_auth_headers
async def t():
    async with httpx.AsyncClient(timeout=30) as c:
        payload = {'url': 'https://www.flydubai.com/en/plan/flights/select-flights?from=DXB&to=KTM&departureDate=2026-06-15&adults=1', 'zone': BRIGHTDATA_UNLOCKER_ZONE, 'format': 'raw'}
        r = await c.post('https://api.brightdata.com/request', json=payload, headers=brightdata_auth_headers())
        text = r.text.lower()
        signals = ['captcha','confirm you are human','unusual traffic','too many requests','access denied','check your browser','blocked','rate limit','please wait','automated query','sorry','verify your identity']
        for s in signals:
            if s in text:
                idx = text.index(s)
                print(f'HONEYPOT: "{s}" at offset {idx}: ...{text[max(0,idx-30):idx+30]}...')
        print(f"\nFirst 500 chars of body:\n{r.text[:500]}")
asyncio.run(t())
