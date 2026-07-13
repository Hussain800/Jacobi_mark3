"""Static travel deployment contract checks with optional Compose validation."""

from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import subprocess
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_SERVICES = {"postgres", "redis", "api", "worker", "frontend"}
REQUIRED_ENVIRONMENT = {
    "JACOBI_TRAVEL_STORAGE",
    "JACOBI_TRAVEL_RUNTIME",
    "JACOBI_TRAVEL_INLINE_WORKER",
    "JACOBI_TRAVEL_CAPABILITY_SECRET",
    "JACOBI_AGENT_STORAGE",
    "JACOBI_MANIFEST_SIGNING_KEY",
    "REDIS_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "AMADEUS_ENVIRONMENT",
    "AMADEUS_CLIENT_ID",
    "AMADEUS_CLIENT_SECRET",
    "AMADEUS_PRODUCTION_APPROVED",
    "ALLOWED_ORIGINS",
    "BRIGHTDATA_API_KEY",
    "BRIGHTDATA_UNLOCKER_ZONE",
}


def _read(relative: str) -> str:
    path = REPO_ROOT / relative
    if not path.is_file():
        raise ValueError(f"missing deployment file: {relative}")
    return path.read_text(encoding="utf-8")


def validate_static_contract() -> list[str]:
    errors: list[str] = []
    compose = _read("compose.yaml")
    services = set(re.findall(r"^  ([a-z][a-z0-9_-]*):\s*$", compose, re.MULTILINE))
    missing_services = REQUIRED_SERVICES - services
    if missing_services:
        errors.append(f"compose missing services: {sorted(missing_services)}")
    if 'profiles: ["distributed"]' not in compose:
        errors.append("separate worker must be gated by the distributed profile")
    for command in (
        '["python", "-m", "uvicorn", "main:app"',
        '["python", "-m", "travel_worker"]',
    ):
        if command not in compose:
            errors.append(f"compose missing process command: {command}")
    if "/api/v2/travel/health/ready" not in compose:
        errors.append("compose API healthcheck does not use travel readiness")

    environment = _read(".env.travel.example")
    declared = {
        match.group(1)
        for match in re.finditer(r"^([A-Z][A-Z0-9_]*)=", environment, re.MULTILINE)
    }
    missing_environment = REQUIRED_ENVIRONMENT - declared
    if missing_environment:
        errors.append(f"environment template missing: {sorted(missing_environment)}")

    backend_dockerfile = _read("Dockerfile")
    frontend_dockerfile = _read("Dockerfile.frontend")
    if "/api/v2/travel/health/ready" not in backend_dockerfile:
        errors.append("backend Dockerfile does not check travel readiness")
    if "npm ci --omit=dev" not in frontend_dockerfile or "npm run build" not in frontend_dockerfile:
        errors.append("frontend Dockerfile is not a production build/runtime split")

    render = _read("render.yaml")
    for preserved in ("JACOBI_COMPARE_STORAGE", "JACOBI_ENABLE_PLAYWRIGHT", "ALLOWED_ORIGINS"):
        if preserved not in render:
            errors.append(f"Render Blueprint lost preserved setting: {preserved}")
    if "/api/v2/travel/health/ready" not in render:
        errors.append("Render Blueprint does not use travel readiness")
    for required in (
        "- type: worker",
        "name: jacobi-travel-worker",
        "dockerCommand: python -m travel_worker",
        "JACOBI_TRAVEL_STORAGE",
        "JACOBI_AGENT_STORAGE",
        "JACOBI_TRAVEL_RUNTIME",
        "JACOBI_TRAVEL_CAPABILITY_SECRET",
        "JACOBI_MANIFEST_SIGNING_KEY",
        "REDIS_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
    ):
        if required not in render:
            errors.append(f"Render Blueprint missing durable worker contract: {required}")
    if "value: memory" in render or 'JACOBI_TRAVEL_INLINE_WORKER\n        value: "1"' in render:
        errors.append("Render Blueprint must not use process-memory or inline-worker production defaults")
    for external in (
        "REDIS_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "AMADEUS_CLIENT_ID",
        "AMADEUS_CLIENT_SECRET",
        "ALLOWED_ORIGINS",
    ):
        pattern = rf"- key: {external}\s+sync: false"
        if re.search(pattern, render) is None:
            errors.append(f"Render API must prompt for external server value: {external}")
    for shared in (
        "JACOBI_TRAVEL_CAPABILITY_SECRET",
        "JACOBI_MANIFEST_SIGNING_KEY",
        "REDIS_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "AMADEUS_CLIENT_ID",
        "AMADEUS_CLIENT_SECRET",
    ):
        if render.count(f"envVarKey: {shared}") != 1:
            errors.append(f"Render worker must reference the API's {shared}")

    bootstrap = _read("scripts/travel-postgres-bootstrap.sql").lower()
    for required in ("create schema if not exists auth", "auth.uid", "public.set_updated_at"):
        if required not in bootstrap:
            errors.append(f"local Postgres bootstrap missing: {required}")

    deployment = _read("docs/travel/DEPLOYMENT.md")
    for required in (
        "docker compose --profile distributed",
        "python -m travel_worker",
        "scripts/package-extension.ps1",
        "docker compose down -v",
    ):
        if required not in deployment:
            errors.append(f"travel deployment runbook missing command: {required}")
    _read("docs/travel/PROVIDER_POLICY.md")
    _read("docs/travel/LIMITATIONS.md")
    return errors


def validate_compose_if_available() -> dict[str, Any]:
    docker = shutil.which("docker")
    if docker is None:
        return {"status": "skipped", "reason": "docker executable is unavailable"}
    result = subprocess.run(
        [docker, "compose", "--profile", "distributed", "config"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    return {
        "status": "validated" if result.returncode == 0 else "failed",
        "returncode": result.returncode,
        "error": result.stderr.strip()[:2000] if result.returncode else None,
    }


def validate_repository() -> dict[str, Any]:
    errors = validate_static_contract()
    compose = validate_compose_if_available()
    if compose["status"] == "failed":
        errors.append(f"docker compose config failed: {compose.get('error')}")
    return {
        "status": "ok" if not errors else "failed",
        "static_errors": errors,
        "compose": compose,
    }


def main() -> int:
    report = validate_repository()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
