"""Container health command for the separate travel worker runtime."""

from __future__ import annotations

import asyncio

from .search.runtime import get_travel_runtime


async def check_runtime() -> bool:
    runtime = get_travel_runtime()
    try:
        return await runtime.healthy()
    finally:
        await runtime.close()


def main() -> int:
    return 0 if asyncio.run(check_runtime()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
