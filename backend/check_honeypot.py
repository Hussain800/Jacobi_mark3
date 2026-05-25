import httpx, asyncio
async def t():
    async with httpx.AsyncClient(timeout=30) as c:
        payload = {'url': 'https://www.flydubai.com/en/plan/flights/select-flights?from=DXB&to=KTM&departureDate=2026-06-15&adults=1', 'zone': 'mcp_unlocker', 'format': 'raw'}
        r = await c.post('https://api.brightdata.com/request', json=payload, headers={'Authorization': 'Bearer 254d841d-f14d-4f4b-a394-3da0b03af036'})
        text = r.text.lower()
        signals = ['captcha','confirm you are human','unusual traffic','too many requests','access denied','check your browser','blocked','rate limit','please wait','automated query','sorry','verify your identity']
        for s in signals:
            if s in text:
                idx = text.index(s)
                print(f'HONEYPOT: "{s}" at offset {idx}: ...{text[max(0,idx-30):idx+30]}...')
        print(f"\nFirst 500 chars of body:\n{r.text[:500]}")
asyncio.run(t())
