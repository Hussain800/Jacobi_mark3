"""Jacobi price-optimization command line interface.

Run from ``backend/`` with ``python -m jacobi``. The CLI is dependency-light
and calls the same comparison facade as REST and MCP.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Sequence

from compare import tooling
from travel import tooling as travel_tooling


def _load_object(path: str) -> dict[str, Any]:
    raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("input must contain a JSON object")
    return payload


def _add_output_flag(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jacobi",
        description="Find the cheapest verified route for an exact product.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    identify = commands.add_parser("identify", help="resolve canonical product identity")
    identify.add_argument("--input", help="JSON object file, or - for stdin")
    for field in (
        "title", "brand", "family", "model", "mpn", "gtin", "sku", "storage",
        "memory", "generation", "processor", "screen-size", "region", "colour",
        "connectivity", "warranty-region",
    ):
        identify.add_argument(f"--{field}")
    identify.add_argument("--year", type=int)
    _add_output_flag(identify)

    for name, help_text in (
        ("compare", "run the complete comparison and return all result groups"),
        ("optimize", "return the cheapest verified route and exclusions"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--input", required=True, help="comparison request JSON, or -")
        _add_output_flag(command)

    providers = commands.add_parser("providers", help="list provider capabilities and costs")
    _add_output_flag(providers)

    health = commands.add_parser("health", help="show local optimization health")
    _add_output_flag(health)

    audit = commands.add_parser("audit", help="run the optional legacy Deep Audit")
    target = audit.add_mutually_exclusive_group(required=True)
    target.add_argument("--demo", choices=("fee_drift", "blocked_route"))
    target.add_argument("--url")
    audit.add_argument("--displayed-total", type=float)
    audit.add_argument("--currency", default="AED")
    audit.add_argument("--consent-scope", default="research_only")
    audit.add_argument("--tier", choices=("free", "pro"), default="free")
    audit.add_argument(
        "--allow-managed-provider",
        action="store_true",
        help="allow the legacy 24/50-profile engine to use deployer-managed credentials",
    )
    audit.add_argument(
        "--confirm-explicit",
        action="store_true",
        help="required acknowledgement that Deep Audit is separate from comparison",
    )
    _add_output_flag(audit)

    travel = commands.add_parser("travel", help="travel Price Guardian tooling")
    travel_commands = travel.add_subparsers(dest="travel_command", required=True)

    travel_eval = travel_commands.add_parser(
        "eval", help="evaluate a versioned travel equivalence corpus"
    )
    travel_eval.add_argument(
        "--dataset",
        required=True,
        help="dataset identifier, for example flight_equivalence_v1",
    )
    _add_output_flag(travel_eval)

    travel_benchmark = travel_commands.add_parser(
        "benchmark", help="benchmark hermetic travel equivalence evaluation"
    )
    travel_benchmark.add_argument("--dataset")
    travel_benchmark.add_argument("--iterations", type=int, default=5)
    travel_benchmark.add_argument("--warmups", type=int, default=1)
    _add_output_flag(travel_benchmark)

    for name, help_text in (
        ("providers", "list travel provider capabilities and configuration"),
        ("health", "show travel tooling/runtime health without probing providers"),
    ):
        subcommand = travel_commands.add_parser(name, help=help_text)
        _add_output_flag(subcommand)

    travel_intent = travel_commands.add_parser(
        "intent", help="validate and normalize a typed flight or hotel intent"
    )
    travel_intent.add_argument("--input", required=True, help="intent JSON object, or -")
    _add_output_flag(travel_intent)

    travel_search = travel_commands.add_parser(
        "search", help="validate and enqueue a durable travel search"
    )
    travel_search.add_argument("--input", required=True, help="search JSON object, or -")
    _add_output_flag(travel_search)

    for name, help_text in (
        ("status", "read a capability-authorized travel search"),
        ("explain", "explain a capability-authorized travel search"),
        ("evidence", "read sanitized capability-authorized travel evidence"),
    ):
        subcommand = travel_commands.add_parser(name, help=help_text)
        subcommand.add_argument("--search-id", required=True)
        subcommand.add_argument(
            "--capability-token", "--access-token", dest="capability_token", required=True
        )
        _add_output_flag(subcommand)

    travel_revalidate = travel_commands.add_parser(
        "revalidate", help="revalidate a flight offer before redirect"
    )
    travel_revalidate.add_argument("--search-id", required=True)
    travel_revalidate.add_argument("--offer-id", required=True)
    travel_revalidate.add_argument(
        "--capability-token", "--access-token", dest="capability_token", required=True
    )
    _add_output_flag(travel_revalidate)
    return parser


def _identity_payload(args: argparse.Namespace) -> dict[str, Any]:
    payload = _load_object(args.input) if args.input else {}
    for key in (
        "title", "brand", "family", "model", "mpn", "gtin", "sku", "storage",
        "memory", "generation", "processor", "screen_size", "year", "region",
        "colour", "connectivity", "warranty_region",
    ):
        value = getattr(args, key)
        if value is not None:
            payload[key] = value
    return payload


def _human_identity(payload: dict[str, Any]) -> str:
    variant = payload["variant"]
    identifiers = [
        value for value in (
            f"GTIN {payload['gtins'][0]}" if payload["gtins"] else None,
            f"MPN {payload['mpn']}" if payload.get("mpn") else None,
            f"model {payload['model']}" if payload.get("model") else None,
        ) if value
    ]
    details = [
        f"{key.replace('_', ' ')}={variant[key]}"
        for key in ("storage", "memory", "generation", "processor", "screen_size", "region", "colour")
        if variant.get(key) is not None
    ]
    return "\n".join([
        f"Product: {payload.get('brand') or 'unknown brand'} {payload.get('model') or payload.get('family') or 'unknown model'}",
        f"Canonical ID: {payload['canonical_id']}",
        f"Confidence: {payload['identity_confidence']:.2f}",
        f"Identifiers: {', '.join(identifiers) if identifiers else 'none'}",
        f"Variant: {', '.join(details) if details else 'unknown'}",
        f"Unknown fields: {', '.join(payload['unknown_fields']) if payload['unknown_fields'] else 'none'}",
    ])


def _human_comparison(payload: dict[str, Any], *, optimize: bool) -> str:
    recommendation = payload["recommendation"]
    lines = [
        recommendation.get("headline") or recommendation.get("status", "comparison complete"),
        recommendation.get("explanation") or "",
    ]
    if recommendation.get("action_url"):
        lines.append(f"Route: {recommendation['action_url']}")
    savings = payload.get("savings", {}).get("amount")
    if savings:
        lines.append(f"Immediate saving: {savings['currency']} {savings['amount']}")
    lines.append(f"Comparison: {payload['comparison_id']}")
    lines.append(f"Evidence: {payload.get('evidence_manifest_id') or 'unavailable'}")
    if optimize:
        lines.append(f"Excluded offers: {len(payload.get('excluded_offers', []))}")
    else:
        counts = [
            f"exact={len(payload.get('eligible_offers', []))}",
            f"tradeoff={len(payload.get('tradeoff_offers', []))}",
            f"similar={len(payload.get('similar_offers', []))}",
            f"rejected={len(payload.get('rejected_offers', []))}",
        ]
        lines.append("Offers: " + ", ".join(counts))
    if payload.get("provider_errors"):
        lines.append(f"Provider partial failures: {len(payload['provider_errors'])}")
    return "\n".join(line for line in lines if line)


def _human_providers(providers: list[dict[str, Any]]) -> str:
    lines = []
    for provider in providers:
        mode = "explicit" if provider["explicit_invocation_required"] else "default"
        fixture = ", fixture" if provider["fixture"] else ""
        lines.append(
            f"{provider['provider_id']}: {provider['kind']}, {provider['cost']}, "
            f"{provider['health']}, {mode}{fixture}"
        )
    return "\n".join(lines)


def _human_travel(payload: Any, command: str) -> str:
    if command == "eval":
        if "vertical" not in payload:
            return (
                f"Travel cost/ranking evaluation: {payload['dataset']}\n"
                f"Records: {payload['record_count']}\n"
                f"Cost accuracy: {payload['cost_accuracy']:.4f}\n"
                f"Ranking exact-match rate: {payload['ranking_exact_match_rate']:.4f}\n"
                f"Ranking agreement: {payload['ranking_agreement']:.4f}\n"
                f"Passed: {payload['passed']}\n"
                f"Cost failures: {', '.join(payload['cost_failures']) or 'none'}\n"
                f"Ranking failures: {', '.join(payload['ranking_failures']) or 'none'}\n"
                "Evidence: fixture corpus; not real-user validation"
            )
        return (
            f"Travel evaluation: {payload['dataset']} ({payload['vertical']})\n"
            f"Correct: {payload['correct_count']}/{payload['record_count']}\n"
            f"Accuracy: {payload['accuracy']:.4f}\n"
            f"Passed: {payload['passed']}\n"
            "Evidence: fixture corpus; not real-user validation"
        )
    if command == "benchmark":
        return (
            f"Travel benchmark: {payload['workload']}\n"
            f"Cases per iteration: {payload['case_count_per_iteration']}\n"
            f"Median: {payload['median_ms']:.3f} ms; p95: {payload['p95_ms']:.3f} ms\n"
            "Includes live-provider latency: False"
        )
    if command == "providers":
        return "\n".join(
            f"{item['provider_id']}: {item['health']}, {item['current_environment']}, "
            f"verticals={','.join(item['verticals'])}"
            for item in payload
        )
    if command == "health":
        return (
            f"Travel tooling: {payload['status']}\n"
            f"Runtime: {payload['runtime']}\n"
            f"Configured providers: {payload['configured_provider_count']}\n"
            "Provider health network requests: 0"
        )
    if command == "intent":
        return (
            f"Travel intent: {payload['vertical']}\n"
            f"Fingerprint: {payload['intent_fingerprint']}\n"
            "Network requests: 0"
        )
    if command == "search":
        return (
            f"Travel search {payload['search_id']}: {payload['status']}\n"
            f"Results: {payload['result_url']}\n"
            "Execution: durable job"
        )
    if command == "status":
        return (
            f"Travel search {payload['search_id']}: {payload['status']}\n"
            f"Offers: {len(payload.get('offers', []))}\n"
            f"Provider attempts: {len(payload.get('provider_attempts', []))}"
        )
    if command == "revalidate":
        return (
            f"Travel offer {payload['offer_id']}: {payload['status']}\n"
            f"Changes: {', '.join(payload.get('changes', [])) or 'none'}"
        )
    if command == "explain":
        return payload["explanation"]
    if command == "evidence":
        return (
            f"Travel evidence for {payload['search_id']}: {len(payload['evidence'])} item(s)\n"
            "Raw provider payloads included: False"
        )
    return str(payload)


def _emit(payload: Any, *, json_output: bool, human: str) -> None:
    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True, default=str))
    else:
        print(human)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "identify":
            payload = tooling.identify_product_fields(_identity_payload(args))
            _emit(payload, json_output=args.json, human=_human_identity(payload))
        elif args.command in {"compare", "optimize"}:
            result = asyncio.run(tooling.compare_request(_load_object(args.input)))
            payload = (
                tooling.optimization_view(result)
                if args.command == "optimize"
                else result.model_dump(mode="json")
            )
            _emit(
                payload,
                json_output=args.json,
                human=_human_comparison(payload, optimize=args.command == "optimize"),
            )
        elif args.command == "providers":
            payload = tooling.provider_catalog()
            _emit(payload, json_output=args.json, human=_human_providers(payload))
        elif args.command == "health":
            payload = tooling.optimization_health()
            human = (
                f"Jacobi price optimization: {payload['status']}\n"
                f"Mandatory provider cost: USD {payload['mandatory_collection_cost_usd']:.2f}\n"
                f"Automatic paid-provider calls: {payload['paid_provider_automatic_calls']}"
            )
            _emit(payload, json_output=args.json, human=human)
        elif args.command == "travel":
            service = travel_tooling.get_travel_tooling_service()
            if args.travel_command == "eval":
                payload = service.evaluate(args.dataset)
            elif args.travel_command == "benchmark":
                payload = service.benchmark(
                    dataset=args.dataset,
                    iterations=args.iterations,
                    warmups=args.warmups,
                )
            elif args.travel_command == "providers":
                payload = service.providers()
            elif args.travel_command == "health":
                payload = asyncio.run(service.health())
            elif args.travel_command == "intent":
                payload = service.parse_intent(_load_object(args.input))
            elif args.travel_command == "search":
                payload = asyncio.run(service.search(_load_object(args.input)))
            elif args.travel_command == "status":
                payload = asyncio.run(
                    service.status(args.search_id, args.capability_token)
                )
            elif args.travel_command == "revalidate":
                payload = asyncio.run(
                    service.revalidate(
                        args.search_id, args.offer_id, args.capability_token
                    )
                )
            elif args.travel_command == "explain":
                payload = asyncio.run(
                    service.explain(args.search_id, args.capability_token)
                )
            else:
                payload = asyncio.run(
                    service.evidence(args.search_id, args.capability_token)
                )
            _emit(
                payload,
                json_output=args.json,
                human=_human_travel(payload, args.travel_command),
            )
        else:
            payload = asyncio.run(tooling.deep_audit(
                explicit=args.confirm_explicit,
                demo=args.demo,
                url=args.url,
                displayed_total_amount=args.displayed_total,
                displayed_total_currency=args.currency,
                consent_scope=args.consent_scope,
                tier=args.tier,
                allow_managed_provider=args.allow_managed_provider,
            ))
            if "error" in payload:
                raise ValueError(payload["error"])
            if payload.get("audit_type") == "synthetic_price_discrimination_matrix":
                audit_result = payload["result"]
                human = (
                    f"Deep Audit: {audit_result.get('status', 'completed')}\n"
                    f"Profiles configured: {audit_result.get('configured_agents', 'unknown')}\n"
                    f"Profiles executed: {audit_result.get('real_probes_executed', 'unknown')}"
                )
            else:
                human = (
                    f"Deep Audit: {payload['decision']}\n"
                    f"{payload['user_explanation']}\n"
                    f"Evidence: {payload['evidence']['manifest_id']}"
                )
            _emit(payload, json_output=args.json, human=human)
        return 0
    except (OSError, RuntimeError, ValueError, TypeError) as exc:
        command = (
            f"travel {args.travel_command}"
            if args.command == "travel"
            else args.command
        )
        error = {"error": str(exc), "command": command}
        if getattr(args, "json", False):
            print(json.dumps(error, sort_keys=True), file=sys.stderr)
        else:
            print(f"jacobi: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
