import httpx, asyncio, re
async def t():
    async with httpx.AsyncClient(timeout=30) as c:
        payload = {'url': 'https://www.flydubai.com/en/plan/flights/select-flights?from=DXB&to=KTM&departureDate=2026-06-15&adults=1', 'zone': 'mcp_unlocker', 'format': 'raw'}
        r = await c.post('https://api.brightdata.com/request', json=payload, headers={'Authorization': 'Bearer 254d841d-f14d-4f4b-a394-3da0b03af036'})
        text = r.text
        # Search for price-like patterns
        patterns = [r'\$\s*(\d[\d,.]*)', r'AED\s*(\d[\d,]*)', r'(\d[\d,]*)\s*AED', r'(\d[\d,]*)\s*د\.إ', r'price.*?(\d[\d,.]*)', r'fare.*?(\d[\d,.]*)']
        for p in patterns:
            matches = re.findall(p, text, re.IGNORECASE)
            if matches:
                print(f'Pattern {p}: {matches[:5]}')
        # Check for common price containers
        for kw in ['price', 'fare', 'total', 'amount', '860', '840', '850']:
            if kw in text.lower():
                idx = text.lower().index(kw)
                print(f'Found "{kw}" at {idx}: ...{text[max(0,idx-40):idx+80]}...')
        print(f'\nTotal HTML length: {len(text)}')
asyncio.run(t())
