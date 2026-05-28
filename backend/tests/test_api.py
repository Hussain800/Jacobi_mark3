from fastapi.testclient import TestClient


def test_health(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_demo(client: TestClient):
    response = client.get("/api/demo")
    assert response.status_code == 200
    data = response.json()
    assert "topology_class" in data
    assert "baseline_price" in data
    assert "agents" in data
    assert isinstance(data["agents"], list)


def test_result_demo(client: TestClient):
    response = client.get("/api/result/demo_session_static")
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "demo_session_static"
    assert "gradients" in data
    assert isinstance(data["gradients"], list)
    assert "agents" in data
    assert isinstance(data["agents"], list)


def test_result_nonexistent(client: TestClient):
    response = client.get("/api/result/nonexistent")
    assert response.status_code == 404


def test_badge_demo(client: TestClient):
    response = client.get("/api/badge/demo_session_static")
    assert response.status_code == 200
    content_type = response.headers.get("content-type", "").lower()
    assert "svg" in content_type


def test_leaderboard(client: TestClient):
    response = client.get("/api/leaderboard")
    assert response.status_code == 200
    data = response.json()
    assert "entries" in data
    assert isinstance(data["entries"], list)


def test_share_demo(client: TestClient):
    response = client.get("/api/share/demo_session_static")
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "demo_session_static"


def test_schedule_valid(client: TestClient):
    response = client.post("/api/schedule", json={
        "target_url": "https://example.com/product",
        "target_name": "Test Product",
        "interval_minutes": 60,
    })
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["status"] == "scheduled"


def test_schedule_empty_body(client: TestClient):
    response = client.post("/api/schedule", json={"target_url": ""})
    assert response.status_code == 400


def test_schedules(client: TestClient):
    response = client.get("/api/schedules")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_probe_with_data_dir(client: TestClient):
    response = client.post("/api/probe", json={
        "target_url": "https://example.com",
        "use_data_dir": "demo",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "demo_session_static"
    assert data["status"] == "completed"


def test_probe_empty_body(client: TestClient):
    response = client.post("/api/probe", json={})
    assert response.status_code == 422


def test_analyze_demo(client: TestClient):
    response = client.get("/api/analyze-demo")
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert "topology_class" in data
