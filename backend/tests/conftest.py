import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(autouse=True)
def _neutralize_prod_env(monkeypatch):
    """Keep tests in in-memory mode under a clean (non-production) environment so
    ambient prod env vars on the runner can't trip the P0-1 fail-closed guard and
    mask coverage. Tests that exercise prod-mode opt in by setting the override."""
    monkeypatch.setenv("ENTERPRISE_REQUIRE_SUPABASE", "0")
    for _var in ("APP_ENV", "VERCEL_ENV", "ENV", "NODE_ENV"):
        monkeypatch.delenv(_var, raising=False)
    yield


@pytest.fixture
def client():
    return TestClient(app)
