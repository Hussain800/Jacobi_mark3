"""Manual smoke test for the production 24-agent probe path."""
import asyncio

from main import run_full_probe


async def main():
    url = "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB"
    result = await run_full_probe(url, "DXB to KTM smoke test")
    print(f"Status: {result.get('status')}")
    print(f"Agents: {result.get('successful_agents')}/{result.get('total_agents')}")
    print(f"Range: {result.get('price_range')}")
    print(f"Spread: ${result.get('max_price_spread')}")
    print(f"Limitations: {result.get('limitations', [])}")


asyncio.run(main())
