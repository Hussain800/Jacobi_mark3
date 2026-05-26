"""Shared Bright Data configuration.

Local development loads secrets from the repo root `.env.local` first, then
backend `.env`. Neither file should be committed.
"""
import os
from pathlib import Path
from typing import Dict

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(PROJECT_ROOT / ".env.local", override=False)
load_dotenv(PROJECT_ROOT / ".env", override=False)
load_dotenv(BACKEND_DIR / ".env.local", override=False)
load_dotenv(BACKEND_DIR / ".env", override=False)
load_dotenv(override=False)

BRIGHTDATA_API_KEY = os.getenv("BRIGHTDATA_API_KEY", "")
BRIGHTDATA_UNLOCKER_ZONE = (
    os.getenv("BRIGHTDATA_UNLOCKER_ZONE")
    or os.getenv("BRIGHTDATA_ZONE")
    or "mcp_unlocker"
)
BRIGHTDATA_CUSTOM_HEADERS_ENABLED = os.getenv(
    "BRIGHTDATA_CUSTOM_HEADERS_ENABLED",
    "false",
).lower() in {"1", "true", "yes", "on"}


def brightdata_configured() -> bool:
    return bool(BRIGHTDATA_API_KEY)


def brightdata_auth_headers() -> Dict[str, str]:
    if not BRIGHTDATA_API_KEY:
        raise RuntimeError(
            "BRIGHTDATA_API_KEY is not configured. Put your key in .env.local or backend/.env."
        )
    return {"Authorization": f"Bearer {BRIGHTDATA_API_KEY}"}
