from __future__ import annotations

from fastapi.testclient import TestClient

import main


def test_next_static_route_serves_assets_but_blocks_encoded_parent_segments(
    monkeypatch,
    tmp_path,
) -> None:
    frontend = tmp_path / "out"
    static = frontend / "_next" / "static"
    static.mkdir(parents=True)
    (static / "asset.js").write_text("safe-static-asset", encoding="utf-8")
    (tmp_path / "private.txt").write_text("must-not-be-served", encoding="utf-8")
    monkeypatch.setattr(main, "FRONTEND_DIR", str(frontend))
    monkeypatch.setattr(main, "FRONTEND_INDEX", None)

    with TestClient(main.app) as client:
        safe = client.get("/_next/static/asset.js")
        escaped = client.get(
            "/_next/static/%2e%2e/%2e%2e/%2e%2e/private.txt"
        )

    assert safe.status_code == 200
    assert safe.text == "safe-static-asset"
    assert escaped.status_code == 404
    assert "must-not-be-served" not in escaped.text
