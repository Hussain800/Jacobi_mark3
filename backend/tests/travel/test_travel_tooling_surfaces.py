from __future__ import annotations

import asyncio
import json

import pytest

from agentcore import mcp_server
from jacobi import main
from travel import tooling
from travel.evaluation import load_dataset
from travel.persistence import InMemoryTravelRepository
from travel.providers import ProviderRegistry
from travel.search import MemoryTravelRuntime
from travel.search.service import TravelSearchNotFound, TravelSearchService


def test_travel_cli_eval_benchmark_providers_and_health(capsys) -> None:
    assert main(
        ["travel", "eval", "--dataset", "flight_equivalence_v1", "--json"]
    ) == 0
    evaluation = json.loads(capsys.readouterr().out)
    assert evaluation["record_count"] == 320
    assert evaluation["passed"] is True
    assert evaluation["evidence_label"] == "fixture"
    assert evaluation["real_user_validation"] is False
    assert evaluation["cost_accuracy"] is None

    assert main(
        [
            "travel",
            "benchmark",
            "--dataset",
            "hotel_equivalence_v1",
            "--iterations",
            "1",
            "--warmups",
            "0",
            "--json",
        ]
    ) == 0
    benchmark = json.loads(capsys.readouterr().out)
    assert benchmark["case_count_per_iteration"] == 320
    assert benchmark["includes_live_provider_latency"] is False
    assert benchmark["evidence_label"] == "fixture"

    assert main(["travel", "providers", "--json"]) == 0
    providers = json.loads(capsys.readouterr().out)
    assert providers[0]["provider_id"] == "amadeus"
    assert providers[0]["fixed_origins"] in (
        ["https://test.api.amadeus.com"],
        ["https://api.amadeus.com"],
    )
    assert providers[0]["health_check_network_request"] is False

    assert main(["travel", "health", "--json"]) == 0
    health = json.loads(capsys.readouterr().out)
    assert health["provider_health_network_requests"] == 0
    assert health["fixture_data_reported_as_live"] is False


def test_travel_cli_intent_uses_domain_validation_and_fingerprint(
    tmp_path, capsys
) -> None:
    record = load_dataset("flight_equivalence_v1")[0]
    request_path = tmp_path / "intent.json"
    request_path.write_text(
        json.dumps({"vertical": "flight", "intent": record.intent}),
        encoding="utf-8",
    )

    assert main(["travel", "intent", "--input", str(request_path), "--json"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["vertical"] == "flight"
    assert len(payload["intent_fingerprint"]) == 64
    assert payload["network_requests_performed"] == 0


def test_tooling_search_reuses_durable_service_and_requires_capability() -> None:
    service = tooling.TravelToolingService(
        TravelSearchService(
            repository=InMemoryTravelRepository(),
            runtime=MemoryTravelRuntime(),
            providers=ProviderRegistry(),
            capability_secret=b"test-travel-tooling-capability-secret",
        )
    )
    record = load_dataset("flight_equivalence_v1")[0]

    result = asyncio.run(
        service.search({"vertical": "flight", "intent": record.intent})
    )
    assert result["status"] == "accepted"
    assert result["execution_mode"] == "durable_job"
    assert result["network_request_completed"] is False

    status = asyncio.run(
        service.status(result["search_id"], result["capability_token"])
    )
    assert status["search_id"] == result["search_id"]
    assert status["status"] == "accepted"
    with pytest.raises(TravelSearchNotFound):
        asyncio.run(service.status(result["search_id"], "wrong-token"))

    explanation = asyncio.run(
        service.explain(result["search_id"], result["capability_token"])
    )
    assert "accepted" in explanation["explanation"]
    evidence = asyncio.run(
        service.evidence(result["search_id"], result["capability_token"])
    )
    assert evidence["raw_provider_payloads_included"] is False


class _FakeTravelService:
    def parse_intent(self, payload):
        return {"operation": "intent", "payload": dict(payload)}

    async def search(self, payload):
        return {"operation": "search", "payload": dict(payload)}

    async def status(self, search_id, access_token):
        return {"operation": "status", "search_id": search_id, "token": access_token}

    async def revalidate(self, search_id, offer_id, access_token):
        return {
            "operation": "revalidate",
            "search_id": search_id,
            "offer_id": offer_id,
            "token": access_token,
        }

    async def explain(self, search_id, access_token):
        return {"operation": "explain", "search_id": search_id, "token": access_token}

    async def evidence(self, search_id, access_token):
        return {"operation": "evidence", "search_id": search_id, "token": access_token}

    def providers(self):
        return []

    async def health(self):
        return {"status": "ready"}

    def evaluate(self, dataset):
        return {"dataset": dataset}

    def benchmark(self, *, dataset=None, iterations=5, warmups=1):
        return {"dataset": dataset, "iterations": iterations, "warmups": warmups}


def test_mcp_travel_tools_are_registered_and_use_injectable_service() -> None:
    names = {tool.name for tool in mcp_server.mcp._tool_manager.list_tools()}
    assert {
        "parse_travel_intent",
        "search_travel",
        "get_travel_search_status",
        "revalidate_travel_offer",
        "explain_travel_search",
        "fetch_travel_evidence",
    } <= names

    tooling.set_travel_tooling_service_for_tests(_FakeTravelService())
    try:
        assert mcp_server.parse_travel_intent('{"vertical":"flight"}')["operation"] == "intent"
        assert asyncio.run(mcp_server.search_travel('{"vertical":"flight"}'))[
            "operation"
        ] == "search"
        assert asyncio.run(mcp_server.get_travel_search_status("s1", "t1"))[
            "operation"
        ] == "status"
        assert asyncio.run(mcp_server.revalidate_travel_offer("s1", "o1", "t1"))[
            "operation"
        ] == "revalidate"
        assert asyncio.run(mcp_server.explain_travel_search("s1", "t1"))[
            "operation"
        ] == "explain"
        assert asyncio.run(mcp_server.fetch_travel_evidence("s1", "t1"))[
            "operation"
        ] == "evidence"
    finally:
        tooling.reset_travel_tooling_service_for_tests()
