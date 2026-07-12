import json

import pytest

from compare.benchmark import benchmark_ranking, main, measure


def test_measure_reports_fresh_observed_timings_without_a_claimed_threshold():
    calls = []
    result = measure(
        "append",
        lambda: calls.append(1),
        iterations=3,
        warmup_iterations=2,
    )
    assert len(calls) == 5
    assert result.operation == "append"
    assert result.iterations == 3
    assert result.warmup_iterations == 2
    assert 0 <= result.min_ms <= result.median_ms <= result.max_ms
    assert result.min_ms <= result.p95_ms <= result.max_ms
    assert result.measured_at


def test_ranking_benchmark_is_hermetic_and_labels_actual_workload():
    result = benchmark_ranking(iterations=2, warmup_iterations=1, candidate_count=7)
    assert result.operation == "rank_7_offers"
    assert result.iterations == 2
    assert result.max_ms >= 0


def test_benchmark_cli_emits_machine_readable_measured_output(monkeypatch, capsys):
    monkeypatch.setattr(
        "sys.argv",
        ["compare.benchmark", "--iterations", "1", "--warmups", "0", "--candidates", "3", "--json"],
    )
    main()
    payload = json.loads(capsys.readouterr().out)
    assert payload["operation"] == "rank_3_offers"
    assert payload["iterations"] == 1
    assert payload["measured_at"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"iterations": 0},
        {"warmup_iterations": -1},
    ],
)
def test_measure_rejects_invalid_sample_counts(kwargs):
    with pytest.raises(ValueError):
        measure("noop", lambda: None, **kwargs)

