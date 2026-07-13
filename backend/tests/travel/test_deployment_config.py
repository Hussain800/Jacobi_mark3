from pathlib import Path
import asyncio
import sys

from fastapi import Response
import pytest
import yaml

from api.v2_travel import travel_liveness, travel_readiness


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from validate_travel_deployment import validate_repository, validate_static_contract  # noqa: E402


class _RuntimeHealthService:
    def __init__(self, runtime: str) -> None:
        self.runtime = runtime

    async def provider_health(self):
        return {
            "runtime": self.runtime,
            "providers": [{"provider_id": "amadeus", "health": "unconfigured"}],
        }


def test_static_deployment_contract_is_complete() -> None:
    assert validate_static_contract() == []


def test_optional_compose_validation_is_explicit() -> None:
    report = validate_repository()
    assert report["status"] == "ok"
    assert report["compose"]["status"] in {"validated", "skipped"}


def test_compose_has_all_runtime_services_and_preserves_bright_data_optionality() -> None:
    compose = (REPO_ROOT / "compose.yaml").read_text(encoding="utf-8")
    for service in ("postgres", "redis", "api", "worker", "frontend"):
        assert f"  {service}:" in compose
    assert "BRIGHTDATA_API_KEY: ${BRIGHTDATA_API_KEY:-}" in compose
    assert "BRIGHTDATA_UNLOCKER_ZONE: ${BRIGHTDATA_UNLOCKER_ZONE:-}" in compose
    assert 'profiles: ["distributed"]' in compose


def test_environment_template_separates_sandbox_and_production_approval() -> None:
    environment = (REPO_ROOT / ".env.travel.example").read_text(encoding="utf-8")
    assert "AMADEUS_ENVIRONMENT=sandbox" in environment
    assert "AMADEUS_PRODUCTION_APPROVED=0" in environment
    assert "JACOBI_TRAVEL_CAPABILITY_SECRET=" in environment
    assert "ALLOWED_ORIGINS=" in environment
    assert "BRIGHTDATA_API_KEY=" in environment


def test_render_blueprint_is_durable_fail_closed_and_shares_worker_secrets() -> None:
    blueprint = yaml.safe_load((REPO_ROOT / "render.yaml").read_text(encoding="utf-8"))
    services = {service["name"]: service for service in blueprint["services"]}
    api = services["jacobi-api"]
    worker = services["jacobi-travel-worker"]
    api_env = {item["key"]: item for item in api["envVars"]}
    worker_env = {item["key"]: item for item in worker["envVars"]}

    assert api["type"] == "web"
    assert api["plan"] == "starter"
    assert api["healthCheckPath"] == "/api/v2/travel/health/ready"
    assert worker["type"] == "worker"
    assert worker["plan"] == "starter"
    assert worker["dockerCommand"] == "python -m travel_worker"
    assert api_env["JACOBI_COMPARE_STORAGE"]["value"] == "supabase"
    assert api_env["ENTERPRISE_REQUIRE_SUPABASE"]["value"] == "1"
    assert api_env["JACOBI_TRAVEL_CAPABILITY_SECRET"]["generateValue"] is True
    assert api_env["JACOBI_MANIFEST_SIGNING_KEY"]["generateValue"] is True

    for key, expected in (
        ("APP_ENV", "production"),
        ("JACOBI_TRAVEL_STORAGE", "supabase"),
        ("JACOBI_AGENT_STORAGE", "supabase"),
        ("JACOBI_TRAVEL_RUNTIME", "redis"),
        ("JACOBI_TRAVEL_INLINE_WORKER", "0"),
        ("AMADEUS_ENVIRONMENT", "production"),
        ("AMADEUS_PRODUCTION_APPROVED", "1"),
        ("AMADEUS_TIMEOUT_SECONDS", "8"),
    ):
        assert api_env[key]["value"] == expected
        assert worker_env[key]["value"] == expected

    for key in (
        "REDIS_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "AMADEUS_CLIENT_ID",
        "AMADEUS_CLIENT_SECRET",
        "ALLOWED_ORIGINS",
    ):
        assert api_env[key]["sync"] is False

    for key in (
        "JACOBI_TRAVEL_CAPABILITY_SECRET",
        "JACOBI_MANIFEST_SIGNING_KEY",
        "REDIS_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "AMADEUS_CLIENT_ID",
        "AMADEUS_CLIENT_SECRET",
    ):
        assert worker_env[key]["fromService"] == {
            "type": "web",
            "name": "jacobi-api",
            "envVarKey": key,
        }


def test_travel_readiness_fails_only_when_required_runtime_is_unhealthy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("JACOBI_TRAVEL_STORAGE", "memory")
    monkeypatch.setenv("JACOBI_TRAVEL_INLINE_WORKER", "1")
    response = Response()
    healthy = asyncio.run(travel_readiness(response, _RuntimeHealthService("healthy")))
    assert response.status_code == 200
    assert healthy["status"] == "ready"
    assert healthy["providers"][0]["health"] == "unconfigured"

    response = Response()
    unhealthy = asyncio.run(travel_readiness(response, _RuntimeHealthService("unhealthy")))
    assert response.status_code == 503
    assert unhealthy["status"] == "not_ready"


def test_travel_liveness_has_no_external_dependency() -> None:
    assert travel_liveness() == {"status": "live", "service": "travel-api"}
