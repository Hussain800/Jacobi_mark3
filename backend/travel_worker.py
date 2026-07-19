"""Separate process entry point for Redis-backed travel search jobs."""

from __future__ import annotations

import asyncio

from travel.search.worker import get_travel_search_worker


async def _main() -> None:
    await get_travel_search_worker().run_forever()


if __name__ == "__main__":
    asyncio.run(_main())
