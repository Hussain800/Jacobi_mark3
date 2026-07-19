import json

from jacobi import main

from test_compare_tooling import REQUEST


def test_cli_identify_human_and_json(capsys):
    assert main([
        "identify", "--brand", "Sony", "--mpn", "WH-1000XM6/B",
        "--title", "Sony WH-1000XM6 Headphones", "--json",
    ]) == 0
    body = json.loads(capsys.readouterr().out)
    assert body["model"] == "WH-1000XM6"

    assert main(["identify", "--brand", "Sony", "--mpn", "WH-1000XM6/B"]) == 0
    assert "Canonical ID:" in capsys.readouterr().out


def test_cli_compare_and_optimize_json(tmp_path, capsys):
    request = tmp_path / "request.json"
    request.write_text(json.dumps(REQUEST), encoding="utf-8")

    assert main(["compare", "--input", str(request), "--json"]) == 0
    compared = json.loads(capsys.readouterr().out)
    assert compared["recommendation"]["status"] == "save"

    assert main(["optimize", "--input", str(request), "--json"]) == 0
    optimized = json.loads(capsys.readouterr().out)
    assert optimized["best_offer"]["merchant_id"] == "sony_ae"
    assert "excluded_offers" in optimized


def test_cli_providers_health_and_explicit_audit(capsys):
    assert main(["providers", "--json"]) == 0
    providers = json.loads(capsys.readouterr().out)
    assert any(item["provider_id"] == "browser_submitted" for item in providers)

    assert main(["health", "--json"]) == 0
    health = json.loads(capsys.readouterr().out)
    assert health["paid_provider_automatic_calls"] is False

    assert main(["audit", "--demo", "fee_drift", "--json"]) == 2
    assert "requires explicit=true" in capsys.readouterr().err

    assert main([
        "audit", "--demo", "fee_drift", "--confirm-explicit", "--json",
    ]) == 0
    audit = json.loads(capsys.readouterr().out)
    assert audit["fixture_mode"] is True


def test_cli_invalid_json_fails_cleanly(tmp_path, capsys):
    request = tmp_path / "bad.json"
    request.write_text("not-json", encoding="utf-8")
    assert main(["compare", "--input", str(request), "--json"]) == 2
    assert json.loads(capsys.readouterr().err)["command"] == "compare"
