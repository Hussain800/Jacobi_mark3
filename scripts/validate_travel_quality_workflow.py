"""Static contract for the dedicated stacked-branch travel quality workflow."""

from __future__ import annotations

from pathlib import Path
import sys

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "travel-quality.yml"
REQUIRED_JOBS = {
    "backend-travel",
    "frontend-build",
    "extension-node",
    "deployment-contract",
    "extension-package",
    "extension-chromium",
}


def _commands(job: dict) -> str:
    return "\n".join(
        str(step.get("run", ""))
        for step in job.get("steps", [])
        if isinstance(step, dict)
    )


def _uses(job: dict) -> list[str]:
    return [
        str(step["uses"])
        for step in job.get("steps", [])
        if isinstance(step, dict) and "uses" in step
    ]


def validate_workflow() -> list[str]:
    if not WORKFLOW.is_file():
        return ["missing .github/workflows/travel-quality.yml"]
    raw = WORKFLOW.read_text(encoding="utf-8")
    try:
        workflow = yaml.load(raw, Loader=yaml.BaseLoader)
    except yaml.YAMLError as exc:
        return [f"invalid workflow YAML: {exc}"]
    if not isinstance(workflow, dict):
        return ["travel workflow must be a mapping"]

    errors: list[str] = []
    triggers = workflow.get("on", {})
    if not isinstance(triggers, dict):
        errors.append("workflow triggers must be a mapping")
        triggers = {}
    if "workflow_dispatch" not in triggers:
        errors.append("workflow_dispatch trigger is required")
    push_branches = set((triggers.get("push") or {}).get("branches", []))
    if "pivot/travel-price-guardian-v1" not in push_branches:
        errors.append("stacked travel branch push trigger is missing")
    pull_request_branches = set(
        (triggers.get("pull_request") or {}).get("branches", [])
    )
    for branch in (
        "main",
        "pivot/price-optimization-mvp",
        "pivot/travel-price-guardian-v1",
    ):
        if branch not in pull_request_branches:
            errors.append(f"pull-request trigger is missing stacked base: {branch}")

    permissions = workflow.get("permissions", {})
    if permissions != {"contents": "read"}:
        errors.append("workflow permissions must be limited to contents: read")

    jobs = workflow.get("jobs", {})
    if not isinstance(jobs, dict):
        return errors + ["workflow jobs must be a mapping"]
    missing_jobs = REQUIRED_JOBS - set(jobs)
    if missing_jobs:
        errors.append(f"workflow missing jobs: {sorted(missing_jobs)}")
        return errors

    for name, job in jobs.items():
        uses = _uses(job)
        if "actions/checkout@v4" not in uses:
            errors.append(f"{name} must use actions/checkout@v4")
        if any("continue-on-error" in step for step in job.get("steps", [])):
            errors.append(f"{name} must not weaken a gate with continue-on-error")

    backend = _commands(jobs["backend-travel"])
    for required in (
        "tests/travel",
        "tests/test_jacobi_cli.py",
        "tests/test_price_optimization_mcp.py",
    ):
        if required not in backend:
            errors.append(f"backend travel job missing: {required}")
    if jobs["backend-travel"].get("env", {}).get("JACOBI_TRAVEL_INLINE_WORKER") != "0":
        errors.append("backend travel job must mirror separate-worker mode")

    frontend = _commands(jobs["frontend-build"])
    for required in ("npm ci", "npm run build"):
        if required not in frontend:
            errors.append(f"frontend job missing: {required}")

    extension = _commands(jobs["extension-node"])
    if "node --test extension/tests/*.test.js" not in extension:
        errors.append("extension Node contract command is missing")

    deployment = _commands(jobs["deployment-contract"])
    for required in (
        "scripts/validate_travel_deployment.py",
        "scripts/validate_travel_quality_workflow.py",
        "test_travel_migration.py",
        "test_deployment_config.py",
    ):
        if required not in deployment:
            errors.append(f"deployment job missing: {required}")

    packaging = _commands(jobs["extension-package"])
    for required in (
        "scripts/test-package-extension.ps1",
        "scripts/package-extension.ps1",
        "-ApiOrigin",
        "-SupportedSiteOrigin",
    ):
        if required not in packaging:
            errors.append(f"extension package job missing: {required}")
    if jobs["extension-package"].get("runs-on") != "windows-latest":
        errors.append("release package must be validated on windows-latest")

    chromium = _commands(jobs["extension-chromium"])
    for required in (
        "test -n \"$CHROME_PATH\"",
        "xvfb-run -a node extension/tests/chromium-extension-test.mjs",
    ):
        if required not in chromium:
            errors.append(f"Chromium gate missing: {required}")
    chromium_node_steps = [
        step
        for step in jobs["extension-chromium"].get("steps", [])
        if isinstance(step, dict) and step.get("uses") == "actions/setup-node@v4"
    ]
    if not chromium_node_steps or chromium_node_steps[0].get("with", {}).get("node-version") != "22":
        errors.append("Chromium gate requires Node 22 for the DevTools WebSocket client")

    for forbidden in ("<all_urls>", "http://*/*", "https://*/*"):
        if forbidden in raw:
            errors.append(f"workflow contains broad origin: {forbidden}")
    return errors


def main() -> int:
    errors = validate_workflow()
    if errors:
        print("Travel quality workflow validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("PASS travel quality workflow contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
